'use babel'

import * as path from 'path'
import { CompositeDisposable, File } from 'atom'
import untildify from 'untildify'

const providers = [
  {
    name: 'go-debug-config',
    warnIfMissing: true,
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

        const index = i++
        p = untildify(p)
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

  startWatching (provider, index, file) {
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

      this.handleFile(provider, index, file, [])
    }).catch((err) => {
      if (provider.warnIfMissing) {
        console.log('go-debug', `Failed to load configuration file '${filePath}'.`, err)
        atom.notifications.addWarning(
          `Please make sure the configuration file '${filePath}' exists`
        )
      }
    })
  }

  handleFile (provider, index, file, events) {
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
