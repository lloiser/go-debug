/* @flow */

import * as path from 'path'
import { CompositeDisposable, File } from 'atom'
import untildify from 'untildify'

import * as Actions from './store-actions'

import type { Store } from './store'
import type { Configuration, ConfigurationFile } from './debugger-flow-types'

declare type Provider = {|
  name: string,
  path: () => mixed,
  validate: (content: Object) => string[],
  prepare: (content: Object) => Configuration[]
|}

const providers: Provider[] = [
  {
    name: 'go-debug-config',
    path: () => atom.config.get('go-debug.configurationFile'),
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

declare type Watcher = (file: string, callback: (event: ?string) => void) => { close: () => void }

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
          { name: 'Test', mode: 'test' }
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
    atom.project.getDirectories().forEach((dir) => {
      providers.forEach((prov) => {
        let providerPaths = prov.path()
        if (!providerPaths == null) {
          return
        }
        if (!Array.isArray(providerPaths)) {
          providerPaths = [providerPaths]
        }
        providerPaths.forEach((p) => {
          if (p == null) {
            return
          }
          const handleFile = ((index) => {
            return (event: ?string) => this.handleFile(file, index, prov, event)
          })(i++)

          // watch for changes
          const filePath = untildify(p)
          const file = path.isAbsolute(filePath) ? new File(filePath) : dir.getFile(filePath)
          const watcher = this._watcher(
            file.getPath(),
            handleFile
          )
          this._subscriptions.add({ dispose: () => watcher.close() })

          handleFile()
        })
      })
    })
  }

  handleFile (file: File, i: number, provider: Object, event: ?string) {
    if (event === 'unlink') {
      this._configurations[i] = null
      this.updateStore()
      return
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

      this._configurations[i] = {
        file: file.getPath(),
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
