'use babel'
/** @jsx etch.dom */

import etch from 'etch'
import EtchComponent from './etch-component'

export default class OutputPanel extends EtchComponent {
  init () {
    if (this.props.model) {
      this.props.model.view = this
    }
    super.init()
  }

  shouldUpdate () {
    return true
  }

  render () {
    const { model } = this.props
    if (!model) {
      return <div />
    }

    const content = model.content()
    return <div className='go-debug-output'>
      <div className='buttons'>
        <button type='button' className='btn go-debug-btn-flat icon icon-trashcan'
          onclick={model.onCleanClick} title='Clean' />
      </div>
      <div ref='content' className='output'
        scrollTop={this.scrollHeight} innerHTML={content} />
    </div>
  }

  readAfterUpdate () {
    let content = this.refs.content
    if (!content) {
      return
    }

    let scrollHeight = content.scrollHeight
    if (scrollHeight && this.scrollHeight !== scrollHeight) {
      this.scrollHeight = scrollHeight
      content.scrollTop = this.scrollHeight
      this.update()
    }
  }
}
