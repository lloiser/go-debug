'use babel'

import Ansi from 'ansi-to-html'
import { subscribe } from './store-utils'
import { CompositeDisposable } from 'atom'

export default class OutputPanelManager {
  constructor () {
    this.key = 'go-debug'
    this.tab = {
      name: 'Debug',
      packageName: 'go-debug',
      icon: 'bug'
    }
    this.subscriptions = new CompositeDisposable()

    this.props = {
      content: [{ type: 'text', value: 'Not started ...' }],
      replValue: '',
      replHistory: []
    }

    this.ansi = null

    this.handleClickClean = this.handleClickClean.bind(this)
    this.handleEnterRepl = this.handleEnterRepl.bind(this)
    this.handleKeyDownRepl = this.handleKeyDownRepl.bind(this)
    this.handleChangeRepl = this.handleChangeRepl.bind(this)
  }

  dispose () {
    if (this.subscriptions) {
      this.subscriptions.dispose()
    }
    this.subscriptions = null
    this.ansi = null
  }

  ready () {
    return !!this._store && !!this._dbg
  }
  setStoreAndDbg (store, dbg) {
    this._store = store
    this._dbg = dbg

    this.subscriptions.add(
      subscribe(store, 'delve.state', this.handleDelveStateChange.bind(this)),
      subscribe(store, 'output.content', this.handleOutputContentChange.bind(this))
    )
  }

  update (props) {
    this.props = Object.assign({}, this.props, props)

    if (this.view) {
      this.view.update()
    }

    if (this.requestFocus && this.props.content.length > 0) {
      this.requestFocus()
    }
  }

  handleDelveStateChange (state, oldState) {
    if (state === 'notStarted') {
      this.ansi = null
    }
  }
  handleOutputContentChange (content, oldContent) {
    const index = content.indexOf(this._lastContent)
    if (index > -1 && index === (content.length - 1)) {
      // nothing has changed
      return
    }
    this._lastContent = content[content.length - 1]

    if (!this.ansi) {
      this.ansi = new Ansi({ stream: true, escapeXML: true })
    }

    let newContent = content.slice(index + 1).map(({ type, ...rest }) => {
      if (type === 'message') {
        return { type, message: this.ansi.toHtml(rest.message) }
      }
      return { type, ...rest }
    })

    if (index === -1) {
      // the last content does not exist anymore, so replace the whole content
    } else {
      // append the new content
      newContent = this.props.content.concat(newContent)
    }

    this.update({
      content: newContent
    })
  }

  handleClickClean (ev) {
    ev.preventDefault()
    this._store.dispatch({ type: 'CLEAR_OUTPUT_CONTENT' })
  }

  handleEnterRepl (value) {
    if (this._dbg && value) {
      this.update({
        replValue: '',
        replHistory: this.props.replHistory.concat(value),
        historyIndex: this.props.replHistory.length + 1
      })
      this._dbg.evaluate(value).then((variables) => {
        if (variables) {
          this._store.dispatch({
            type: 'ADD_OUTPUT_CONTENT',
            content: {
              type: 'eval',
              variables
            }
          })
        }
      })
    }
  }
  handleKeyDownRepl (ev) {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') {
      return
    }

    let { historyIndex } = this.props
    if (ev.key === 'ArrowUp' && historyIndex > 0) {
      historyIndex = historyIndex - 1
    }
    if (ev.key === 'ArrowDown' && historyIndex < this.props.replHistory.length) {
      historyIndex = historyIndex + 1
    }

    this.update({ historyIndex, replValue: this.props.replHistory[historyIndex] || '' })
  }
  handleChangeRepl (replValue) {
    this.update({ replValue })
  }
}
