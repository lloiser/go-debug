'use babel'

import Ansi from 'ansi-to-html'

class OutputPanelManager {
  constructor () {
    this.key = 'go-debug'
    this.tab = {
      name: 'Debug',
      packageName: 'go-debug',
      icon: 'bug'
    }

    this.props = { messages: [], content: null }
    this.ansi = new Ansi()

    this.onCleanClick = this.onCleanClick.bind(this)
  }

  dispose () {
    if (this.subscriptions) {
      this.subscriptions.dispose()
    }
    this.subscriptions = null
    this.ansi = null
  }

  content () {
    if (this.props.content !== null) {
      return this.props.content
    }
    return 'No debug session started ...'
  }

  update (props) {
    let oldProps = this.props
    this.props = Object.assign({}, oldProps, props)

    if (this.view) {
      this.view.update()
    }

    if (this.requestFocus && this.props.messages.length > 0) {
      this.requestFocus()
    }
  }

  addOutputMessage (type, message) {
    if (type === 'clear') {
      this.update({
        messages: [],
        content: ''
      })
      return
    }
    this.update({
      messages: this.props.messages.concat({ type, message }),
      content: (this.props.content || '') + this.ansi.toHtml(message)
    })
  }

  onCleanClick (ev) {
    ev.preventDefault()
    this.update({ messages: [], content: '' })
  }
}

const manager = new OutputPanelManager()

export default {
  getManager () {
    return manager
  },
  addOutputMessage (...args) {
    manager.addOutputMessage(...args)
  }
}
