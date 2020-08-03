import { AxiosInstance } from 'axios'
import sdk from 'botpress/sdk'
import LRUCache from 'lru-cache'

export const BIO = {
  INSIDE: 'I',
  BEGINNING: 'B',
  OUT: 'o'
} as _.Dictionary<Tag>

export type Tag = 'o' | 'B' | 'I'

export interface Token2Vec {
  [token: string]: number[]
}

export interface Gateway {
  source: LanguageSource
  client: AxiosInstance
  errors: number
  disabledUntil?: Date
}

export interface LangsGateway {
  [lang: string]: Gateway[]
}

export interface LanguageProvider {
  languages: string[]
  langServerInfo: sdk.NLUCore.LangServerInfo
  vectorize(tokens: string[], lang: string): Promise<Float32Array[]>
  tokenize(utterances: string[], lang: string, vocab?: Token2Vec): Promise<string[][]>
  generateSimilarJunkWords(subsetVocab: string[], lang: string): Promise<string[]>
  getHealth(): Partial<sdk.NLUCore.NLUHealth>
}

export interface LanguageSource {
  /** The endpoint URL of the source */
  endpoint: string
  /** The authentication token, if required by the source */
  authToken?: string
}

export interface NluMlRecommendations {
  minUtterancesForML: number
  goodUtterancesForML: number
}

export interface EntityService {
  getSystemEntities(): sdk.NLU.EntityDefinition[]
  getCustomEntities(): Promise<sdk.NLU.EntityDefinition[]>
  getEntities(): Promise<sdk.NLU.EntityDefinition[]>
  getEntity(x: string): Promise<sdk.NLU.EntityDefinition>
  deleteEntity(x: string): Promise<void>
  saveEntity(x: sdk.NLU.EntityDefinition): Promise<void>
  updateEntity(x: string, y: sdk.NLU.EntityDefinition): Promise<void>
}

export type NLUState = {
  nluByBot: _.Dictionary<BotState>
  broadcastLoadModel?: (botId: string, hash: string, language: string) => Promise<void>
  broadcastCancelTraining?: (botId: string, language: string) => Promise<void>
  reportTrainingProgress: sdk.NLUCore.ProgressReporter
} & sdk.NLUCore.NLUVersionInfo

export interface BotState {
  botId: string
  engine: sdk.NLUCore.NLUEngine
  trainWatcher: sdk.ListenHandle
  trainOrLoad: (forceTrain: boolean) => Promise<void>
  trainSessions: _.Dictionary<sdk.NLUCore.TrainingSession>
  cancelTraining: () => Promise<void>
  isTraining: () => Promise<boolean>
  entityService: EntityService
}

export type TFIDF = _.Dictionary<number>

export type PatternEntity = Readonly<{
  name: string
  pattern: string
  examples: string[]
  matchCase: boolean
  sensitive: boolean
}>

export type ListEntity = Readonly<{
  name: string
  synonyms: { [canonical: string]: string[] }
  fuzzyTolerance: number
  sensitive: boolean
}>

export type EntityCache = LRUCache<string, EntityExtractionResult[]>
export type EntityCacheDump = LRUCache.Entry<string, EntityExtractionResult[]>[]

export interface ListEntityModel {
  type: 'custom.list'
  id: string
  languageCode: string
  entityName: string
  fuzzyTolerance: number
  sensitive: boolean
  /** @example { 'Air Canada': [ ['Air', '_Canada'], ['air', 'can'] ] } */
  mappingsTokens: _.Dictionary<string[][]>
  cache?: EntityCache | EntityCacheDump
}

export interface ExtractedSlot {
  confidence: number
  name: string
  source: string
  value: any
  entity?: EntityExtractionResult
}

export interface SlotExtractionResult {
  slot: ExtractedSlot
  start: number
  end: number
}
export type EntityExtractor = 'system' | 'list' | 'pattern'
export interface ExtractedEntity {
  confidence: number
  type: string
  metadata: {
    source: string
    entityId: string
    extractor: EntityExtractor
    unit?: string
    occurrence?: string
  }
  sensitive?: boolean
  value: string
}
export type EntityExtractionResult = ExtractedEntity & { start: number; end: number }

export interface Tools {
  tokenize_utterances(utterances: string[], languageCode: string, vocab?: Token2Vec): Promise<string[][]>
  vectorize_tokens(tokens: string[], languageCode: string): Promise<number[][]>
  partOfSpeechUtterances(utterances: string[][], languageCode: string): string[][]
  generateSimilarJunkWords(vocabulary: string[], languageCode: string): Promise<string[]>
  getHealth(): sdk.NLUCore.NLUHealth
  getLanguages(): string[]
  duckling: SystemEntityExtractor
  mlToolkit: typeof sdk.MLToolkit
}

export interface NLUProgressEvent {
  type: 'nlu'
  working: boolean
  botId: string
  message: string
  trainSession: sdk.NLUCore.TrainingSession
}

export interface SystemEntityExtractor {
  extractMultiple(input: string[], lang: string, useCache?: Boolean): Promise<EntityExtractionResult[][]>
  extract(input: string, lang: string): Promise<EntityExtractionResult[]>
}

export type Intent<T> = Readonly<{
  name: string
  contexts: string[]
  slot_definitions: SlotDefinition[]
  utterances: T[]
  vocab?: _.Dictionary<boolean>
  slot_entities?: string[]
}>

type SlotDefinition = Readonly<{
  name: string
  entities: string[]
}>
