import { EventEmitter } from 'events'

import { Distro } from './common/getos'
import { getAppDataPath } from './core/misc/app_data'

const { Debug: _Debug } = require('./debug.ts')

global.DEBUG = _Debug

if (!process.core_env) {
  process.core_env = process.env as BotpressEnvironmentVariables
}

if (!process.BOTPRESS_EVENTS) {
  process.BOTPRESS_EVENTS = new EventEmitter()
}

if (process.env.APP_DATA_PATH) {
  process.APP_DATA_PATH = process.env.APP_DATA_PATH
} else {
  process.APP_DATA_PATH = getAppDataPath()
}

const os = require('os').platform()

const distribution =
  os !== 'linux'
    ? {
        os,
        codename: '',
        dist: '',
        release: ''
      }
    : {
        os,
        codename: '',
        dist: 'Alpine Linux', // github checks runs on alpine...
        release: '3.11.6'
      }
process.distro = new Distro(distribution)
