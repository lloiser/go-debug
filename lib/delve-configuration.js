/* @flow */

import * as path from 'path'
import { CompositeDisposable, File } from 'atom'
import untildify from 'untildify'

import * as Actions from './store-actions'

import type { Store } from './store'
import type { Configuration, ConfigurationFile } from './debugger-flow-types'

declare type Provider = {|
  name: string,
  warnIfMissing: boolean,
  path: () => string,
  validate: (content: Object) => string[],
  prepare: (content: Object) => Configuration[]
|}

const providers: Provider[] = [
  {
    name: 'go-debug-config',
    warnIfMissing: true,
    path: () => (atom.config.get('go-debug.configurationFile'): any),
    validate: (content) => {
      const issues = []
      if (!Array.isArray(content.configurations)) {
        issues.push(`Expected an object like { configurations: [ ... ] } but got ${JSON.stringify(content)} instead!`)
      }
      return issues
    },
    prepare: (content) => content.configurations
  },
  {
    // try to use the vscode settings too
    name: 'vscode',
    warnIfMissing: false,
    path: () => path.join('.vscode', 'launch.json'),
    validate: (content) => {
      const issues = []
      if (!Array.isArray(content.configurations)) {
        issues.push(`Expected an object like { configurations: [ ... ] } but got ${JSON.stringify(content)} instead!`)
      }
      return issues
    },
    prepare: (content) => content.configurations
  }
]

declare type WatchAction = { action: string }
declare type Watcher = (file: string, callback: (events: WatchAction[]) => void) => Promise<*>

export class DelveConfiguration {
  _store: Store
  _watcher: Watcher
  _subscriptions: CompositeDisposable
  _configurations: Array<?ConfigurationFile>

  constructor (store: Store, watcher: Watcher) {
    this._store = store
    this._watcher = watcher

    this._subscriptions = new CompositeDisposable()

    // add the default configs
    this._configurations = [
      {
        file: '',
        configs: [
          { name: 'Debug', mode: 'debug' },
          { name: 'Test', mode: 'test' },
          { name: 'Attach', mode: 'attach' }
        ]
      }
    ]
    this.updateStore() // set the default configs in the store

    this.start()
  }

  dispose () {
    this._subscriptions.dispose()
  }

  start () {
    let i = 1 // skip one for the default configs
    providers.forEach((provider) => {
      let providerPaths = provider.path()
      if (providerPaths == null || providerPaths === '') {
        return
      }
      if (!Array.isArray(providerPaths)) {
        providerPaths = [providerPaths]
      }
      providerPaths.forEach((pp) => {
        if (!pp) {
          return
        }

        const index = i++
        const p = untildify(pp)
        if (path.isAbsolute(p)) {
          this.startWatching(provider, index, new File(p))
          return
        }

        atom.project.getDirectories().forEach((dir) => {
          this.startWatching(provider, index, dir.getFile(p))
        })
      })
    })
  }

  startWatching (provider: Provider, index: number, file: File) {
    const handleFile = (events) => {
      this.handleFile(provider, index, file, events)
    }

    // Watch for changes on the parent folder.
    // The events then contains changes for all files in there
    // which needs to be filtered out to match this file
    const filePath = file.getPath()
    this._watcher(filePath, handleFile).then((watcher) => {
      this._subscriptions.add(watcher)
      watcher.onDidError((err) => {
        console.warn('go-debug', `Watching for changes on the configuration file '${filePath}' failed.`, err)
      })

      handleFile([])
    }).catch((err) => {
      if (provider.warnIfMissing) {
        console.log('go-debug', `Failed to load configuration file '${filePath}'.`, err)
        atom.notifications.addWarning(
          `Please make sure the configuration file '${filePath}' exists`
        )
      }
    })
  }

  handleFile (provider: Provider, index: number, file: File, events: WatchAction[]) {
    for (const event of events) {
      if (event.action === 'deleted') {
        this._configurations[index] = null
        this.updateStore()
        return false
      }
    }
    file.read(true).then((rawConfig) => {
      const configPath = file.getPath()
      let content
      try {
        content = JSON.parse(rawConfig)
      } catch (e) {
        atom.notifications.addWarning(`The configuration file '${configPath}' does not have the correct format!`, {
          detail: e.toString()
        })
        return
      }
      if (!content) {
        return
      }

      const providerIssues = provider.validate(content)
      if (providerIssues.length) {
        atom.notifications.addWarning(`The configuration file '${configPath}' contains some issues:`, {
          detail: providerIssues.join('\r\n')
        })
        return
      }

      const configs = provider.prepare(content)

      const configIssues = this.validate(configs)
      if (configIssues.length) {
        atom.notifications.addWarning(`The configuration file '${configPath}' contains some issues:`, {
          detail: configIssues.join('\r\n')
        })
        return
      }

      this._configurations[index] = {
        file: configPath,
        configs
      }

      this.updateStore()
    })
  }

  validate (configs: Configuration[]) {
    const issues = []
    configs.forEach((c, i) => {
      if (!c.name) {
        issues.push(`The ${i + 1}. configuration needs a 'name'!`)
      }
      if (!c.mode) {
        issues.push(`The ${i + 1}. configuration needs a 'mode'!`)
      }
    })
    return issues
  }

  updateStore () {
    this._store.dispatch(Actions.setConfigurations(this._configurations.slice().filter(Boolean)))
  }
}
