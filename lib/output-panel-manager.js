/* @flow */

import Ansi from 'ansi-to-html'
import { CompositeDisposable } from 'atom'

import { subscribePath } from './store-utils'
import * as Actions from './store-actions'
import { assign } from './utils'

import type { Store } from './store'
import type { DebuggerState, Variables, OutputContent } from './debugger-flow-types'
import type { OutputPanel } from './output-panel'

declare type OutputPanelProps = {|
  content: OutputContent[],
  replValue: string,
  replHistory: string[],
  historyIndex: number,
  model: OutputPanelManager // eslint-disable-line
|}

export class OutputPanelManager {
  key = 'go-debug'
  tab = {
    name: 'Debug',
    packageName: 'go-debug',
    icon: 'bug'
  }
  props: OutputPanelProps = {
    content: [],
    replValue: '',
    replHistory: [],
    historyIndex: 0,
    model: this
  }
  ansi = null
  lastContent: ?OutputContent = null

  store: Store
  subscriptions: CompositeDisposable
  onEvaluate: (value: string) => Promise<Variables>

  view: ?OutputPanel
  requestFocus: ?() => void

  handleClickClean: Function
  handleEnterRepl: Function
  handleKeyDownRepl: Function
  handleChangeRepl: Function

  constructor (store: Store, onEvaluate: (value: string) => Promise<Variables>) {
    this.store = store
    this.onEvaluate = onEvaluate

    this.subscriptions = new CompositeDisposable(
      subscribePath(store, 'state', this.handleDelveStateChange.bind(this)),
      subscribePath(store, 'output.content', this.handleOutputContentChange.bind(this))
    )

    this.handleClickClean = this.handleClickClean.bind(this)
    this.handleEnterRepl = this.handleEnterRepl.bind(this)
    this.handleKeyDownRepl = this.handleKeyDownRepl.bind(this)
    this.handleChangeRepl = this.handleChangeRepl.bind(this)
  }

  dispose () {
    if (this.subscriptions) {
      this.subscriptions.dispose()
      delete this.subscriptions
    }
    this.ansi = null
  }

  update (props: $Shape<OutputPanelProps>) {
    this.props = assign(this.props, props)

    if (this.view) {
      this.view.update({ model: this })
    }

    if (this.requestFocus && this.props.content.length > 0) {
      this.requestFocus()
    }
  }

  handleDelveStateChange (state: ?DebuggerState) {
    if (state === 'notStarted') {
      this.ansi = null
    }
  }
  handleOutputContentChange (content: ?OutputContent[]) {
    if (!content) {
      return
    }

    const index = this.lastContent ? content.indexOf(this.lastContent) : -1
    if (index > -1 && index === (content.length - 1)) {
      // nothing has changed
      return
    }
    this.lastContent = content[content.length - 1]

    let newContent = content.slice(index + 1).map((content: OutputContent) => {
      if (content.type === 'message') {
        if (!this.ansi) {
          this.ansi = new Ansi({ stream: true, escapeXML: true })
        }
        return { ...content, message: this.ansi.toHtml(content.message) }
      }
      return content
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

  handleClickClean (ev: MouseEvent) {
    ev.preventDefault()
    this.store.dispatch(Actions.clearOutputContent())
  }

  handleEnterRepl (value: string) {
    if (value) {
      this.update({
        replValue: '',
        replHistory: this.props.replHistory.concat(value),
        historyIndex: this.props.replHistory.length + 1
      })

      this.onEvaluate(value).then((variables) => {
        if (variables) {
          this.store.dispatch(Actions.addOutputEvalVariables(variables))
        }
      })
    }
  }
  handleKeyDownRepl (ev: KeyboardEvent) {
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
  handleChangeRepl (replValue: string) {
    this.update({ replValue })
  }
}
