import * as sdk from 'botpress/sdk'
import { ConfigProvider } from 'core/config/config-loader'
import Database from 'core/database'
import { EventRepository } from 'core/repositories'
import { TYPES } from 'core/types'
import { inject, injectable, tagged } from 'inversify'
import Knex from 'knex'
import _ from 'lodash'
import moment from 'moment'
import ms from 'ms'
import yn from 'yn'

import { SessionIdFactory } from '../dialog/session/id-factory'

type BatchEvent = sdk.IO.StoredEvent & { retry?: number }
export const LAST_EVENT_STEP = 'completed'

const eventsFields = [
  'id',
  'botId',
  'channel',
  'threadId',
  'target',
  'sessionId',
  'direction',
  'incomingEventId',
  'workflowId',
  'feedback',
  'success',
  'event',
  'createdOn'
]

@injectable()
export class EventCollector {
  private readonly MAX_RETRY_ATTEMPTS = 3
  private readonly BATCH_SIZE = 100
  private readonly PRUNE_INTERVAL = ms('30s')
  private readonly TABLE_NAME = 'events'
  private knex!: Knex & sdk.KnexExtension
  private intervalRef
  private currentPromise
  private lastPruneTs: number = 0

  private enabled = false
  private discardEventSteps = yn(process.env.BP_DISCARD_EVENT_STEPS)
  private interval!: number
  private retentionPeriod!: number
  private batch: BatchEvent[] = []
  private ignoredTypes: string[] = []
  private ignoredProperties: string[] = []
  private debuggerProperties: string[] = []

  constructor(
    @inject(TYPES.Logger)
    @tagged('name', 'EventCollector')
    private logger: sdk.Logger,
    @inject(TYPES.EventRepository) private eventRepo: EventRepository,
    @inject(TYPES.ConfigProvider) private configProvider: ConfigProvider
  ) {}

  async initialize(database: Database) {
    const config = (await this.configProvider.getBotpressConfig()).eventCollector
    if (!config || !config.enabled) {
      return
    }

    this.knex = database.knex
    this.interval = ms(config.collectionInterval)
    this.retentionPeriod = ms(config.retentionPeriod)
    this.ignoredTypes = config.ignoredEventTypes || []
    this.ignoredProperties = config.ignoredEventProperties || []
    this.debuggerProperties = config.debuggerProperties || []
    this.enabled = true
  }

  public storeEvent(event: sdk.IO.OutgoingEvent | sdk.IO.IncomingEvent, step?: string) {
    if (!this.enabled || this.ignoredTypes.includes(event.type)) {
      return
    }

    if (!event.botId || !event.channel || !event.direction) {
      throw new Error(`Can't store event missing required fields (botId, channel, direction)`)
    }

    if (this.discardEventSteps && step !== LAST_EVENT_STEP) {
      return
    }

    const { id, botId, channel, threadId, target, direction } = event

    const incomingEventId = (event as sdk.IO.OutgoingEvent).incomingEventId
    const sessionId = SessionIdFactory.createIdFromEvent(event)
    const lastWf = (event as sdk.IO.IncomingEvent).state.session?.lastWorkflows?.[0]
    const workflowId = lastWf?.active ? lastWf.eventId : undefined
    const success = lastWf?.active ? lastWf?.success : undefined

    // Once the workflow is a success or failure, it becomes inactive
    if (lastWf?.success !== undefined) {
      const metric = lastWf.success ? 'bp_core_workflow_completed' : 'bp_core_workflow_failed'
      BOTPRESS_CORE_EVENT(metric, { botId: event.botId, channel: event.channel, wfName: lastWf.workflow })

      lastWf.active = false
    }

    if (!this.discardEventSteps && step) {
      event.processing = { ...(event.processing || {}), [step]: new Date() }
    }

    const ignoredProps = [...this.ignoredProperties, ...(event.debugger ? [] : this.debuggerProperties), 'debugger']

    const entry: sdk.IO.StoredEvent = {
      id,
      botId,
      channel,
      threadId,
      target,
      sessionId,
      direction,
      workflowId,
      success,
      incomingEventId: event.direction === 'outgoing' ? incomingEventId : id,
      event: ignoredProps.length ? (_.omit(event, ignoredProps) as sdk.IO.Event) : event,
      createdOn: this.knex.date.now()
    }

    const exists = this.batch.findIndex(x => x.id === id)
    if (exists !== -1) {
      this.batch.splice(exists, 1, entry)
    } else {
      this.batch.push(entry)
    }
  }

  public start() {
    if (this.intervalRef || !this.enabled) {
      return
    }
    this.intervalRef = setInterval(this._runTask, this.interval)
  }

  public stop() {
    clearInterval(this.intervalRef)
    this.intervalRef = undefined
    this.logger.info('Stopped')
  }

  private buildQuery = (elements: BatchEvent[]) => {
    const values = elements
      .map(entry => {
        // tslint:disable-next-line: no-null-keyword
        const mappedValues = eventsFields.map(x => (x === 'event' ? JSON.stringify(entry[x]) : entry[x]) ?? null)
        return this.knex.raw(`(${eventsFields.map(() => '?').join(',')})`, mappedValues).toQuery()
      })
      .join(',')

    return this.knex
      .raw(
        `INSERT INTO ${this.TABLE_NAME}
      (${eventsFields.map(x => `"${x}"`).join(',')}) values ${values}
        ON CONFLICT("id")
        DO UPDATE SET event = EXCLUDED.event`
      )
      .toQuery()
  }

  private _runTask = async () => {
    if (this.currentPromise || !this.batch.length) {
      return
    }

    const batchCount = this.batch.length >= this.BATCH_SIZE ? this.BATCH_SIZE : this.batch.length
    const elements = this.batch.splice(0, batchCount)

    this.currentPromise = this.knex
      .transaction(async trx => {
        await trx.raw(this.buildQuery(elements))
      })
      .then(() => {
        if (Date.now() - this.lastPruneTs >= this.PRUNE_INTERVAL) {
          this.lastPruneTs = Date.now()
          return this.runCleanup().catch(err => {
            /* swallow errors */
          })
        }
      })
      .catch(err => {
        this.logger.attachError(err).error(`Couldn't store events to the database. Re-queuing elements`)
        const elementsToRetry = elements
          .map(x => ({ ...x, retry: x.retry ? x.retry + 1 : 1 }))
          .filter(x => x.retry < this.MAX_RETRY_ATTEMPTS)
        this.batch.push(...elementsToRetry)
      })
      .finally(() => {
        this.currentPromise = undefined
      })
  }

  private async runCleanup() {
    const expiration = moment()
      .subtract(this.retentionPeriod)
      .toDate()

    return this.eventRepo.pruneUntil(expiration)
  }
}
