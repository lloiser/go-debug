'use babel'

import * as path from 'path'
import { CompositeDisposable, File } from 'atom'
import untildify from 'untildify'

const providers = [
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

export default class DelveConfiguration {
  constructor (store, watcher) {
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
        if (!providerPaths) {
          return
        }
        if (!Array.isArray(providerPaths)) {
          providerPaths = [providerPaths]
        }
        providerPaths.forEach((p) => {
          if (!p) {
            return
          }
          const handleFile = ((index) => {
            return (event) => this.handleFile(file, index, prov, event)
          })(i++)

          // watch for changes
          p = untildify(p)
          const file = path.isAbsolute(p) ? new File(p) : dir.getFile(p)
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

  handleFile (file, i, provider, event) {
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

  validate (configs) {
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
    this._store.dispatch({ type: 'SET_CONFIGURATION', configurations: this._configurations.slice() })
  }
}
