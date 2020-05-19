import * as sdk from 'botpress/sdk'
import _ from 'lodash'
import ms from 'ms'

import { EventCollector } from './event-collector'

type MiddlewareChainOptions = {
  timeoutInMs: number
}

const defaultOptions = {
  timeoutInMs: ms('2s')
}

export class MiddlewareChain {
  private stack: { mw: sdk.IO.MiddlewareHandler; name: string }[] = []

  constructor(private eventCollector: EventCollector, private options: MiddlewareChainOptions = defaultOptions) {
    this.options = { ...defaultOptions, ...options }
  }

  use({ handler, name }) {
    this.stack.push({ mw: handler, name })
  }

  async run(event: sdk.IO.Event) {
    for (const { mw, name } of this.stack) {
      let timedOut = false
      const timePromise = new Promise(() => {}).timeout(this.options.timeoutInMs).catch(() => {
        timedOut = true
      })
      const mwPromise = Promise.fromCallback<boolean>(cb => mw(event, cb), { multiArgs: true })
      const result = await Promise.race<Boolean[]>([timePromise, mwPromise])

      if (timedOut) {
        this.eventCollector.storeEvent(event, `mw:${name}:timedOut`)
        continue
      } else if (typeof result !== 'undefined') {
        const [swallow, skipped] = result as Boolean[]

        if (swallow) {
          this.eventCollector.storeEvent(event, `mw:${name}:swallowed`)
          break
        }

        if (skipped) {
          this.eventCollector.storeEvent(event, `mw:${name}:skipped`)
        } else {
          this.eventCollector.storeEvent(event, `mw:${name}:completed`)
        }
      }
    }
  }
}
