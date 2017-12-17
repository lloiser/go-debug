/* @flow */
/** @jsx etch.dom */

import etch from 'etch'
import { EtchComponent } from './etch-component'

declare type ExpandableProps = {|
  expanded: boolean,
  title: string,
  name: string,
  onChange: (name: string) => void,
  children: etch$Node[]
|}
export class Expandable extends EtchComponent<ExpandableProps> {
  handleExpandChange: Function

  init () {
    this.handleExpandChange = this.handleExpandChange.bind(this)
  }

  render () {
    const { expanded, title } = this.props
    return <div className='go-debug-expandable' dataset={{ expanded }}>
      <div className='go-debug-expandable-header panel-heading' onclick={this.handleExpandChange}>
        <span className={'go-debug-icon icon icon-chevron-' + (expanded ? 'down' : 'right')} />
        {title}
      </div>
      <div className='go-debug-expandable-body'>
        {this.children}
      </div>
    </div>
  }

  handleExpandChange () {
    this.props.onChange(this.props.name)
  }
}
