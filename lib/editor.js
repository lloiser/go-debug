/* @flow */

import { indexOfBreakpointByName, getBreakpoints } from './store-utils'
import { debounce } from './utils'

import type { Store } from './store'
import type { Debugger } from './debugger'
import type { Breakpoint } from './debugger-flow-types'
import type { TextEditor } from 'atom'

export class Editor {
  _store: Store
  _dbg: Debugger
  _editor: TextEditor

  _markers: { [key: string]: { bp: Breakpoint, decoration: atom$Decoration } }
  _gutter: atom$Gutter

  constructor (store: Store, dbg: Debugger, editor: TextEditor) {
    this._store = store
    this._dbg = dbg
    this._editor = editor

    this._markers = {} // contains the breakpoint markers by their breakpoint name

    this._gutter = this._editor.addGutter({ name: 'debug', priority: -100 })
    const gutterView = atom.views.getView(this._gutter)
    gutterView.addEventListener('click', this.handleGutterClick.bind(this))
  }
  destroy () {
    // remove all breakpoint decorations (marker)
    Object.keys(this._markers).forEach((name) => {
      this._markers[name].decoration.getMarker().destroy()
    })
    this._markers = {}

    this.destroyGutter()
  }
  destroyGutter () {
    if (!this._gutter) {
      return
    }

    try {
      this._gutter.destroy()
    } catch (e) {
      console.warn('go-debug', e)
    }

    delete this._gutter
  }

  createMarkerDecoration (bp: Breakpoint) {
    const el = document.createElement('div')
    el.className = 'go-debug-breakpoint go-debug-breakpoint-state-' + bp.state
    el.dataset.name = bp.name
    el.dataset.file = bp.file
    el.dataset.line = bp.line.toString()
    el.title = bp.message || ''
    return {
      class: 'go-debug-gutter-breakpoint',
      item: el
    }
  }

  updateMarkers () {
    const file = this._editor.getPath()
    if (file == null) {
      return
    }
    const bps = getBreakpoints(this._store, file)

    // update and add markers
    bps.forEach((bp) => this.updateMarker(bp))

    // remove remaining
    Object.keys(this._markers).forEach((name) => {
      const index = indexOfBreakpointByName(bps, name)
      if (index === -1) {
        this.removeMarker(name)
      }
    })
  }
  updateMarker (bp: Breakpoint) {
    const decoration = this.createMarkerDecoration(bp)
    let marker = this._markers[bp.name]

    if (!this._gutter) {
      return
    }

    // create a new decoration
    if (!marker) {
      let m = this._editor.markBufferPosition([bp.line, 0])
      m.onDidChange(debounce(this.handleMarkerDidChange.bind(this, bp.name), 50))
      this._markers[bp.name] = {
        bp,
        decoration: this._gutter.decorateMarker(m, decoration)
      }
      return
    }

    // update an existing decoration if the breakpoint has changed
    if (marker.bp === bp) {
      return
    }
    marker.bp = bp
    marker.decoration.setProperties(Object.assign(
      {},
      marker.decoration.getProperties(),
      decoration
    ))
  }

  removeMarker (name: string) {
    const marker = this._markers[name]
    if (marker) {
      marker.decoration.getMarker().destroy()
      delete this._markers[name]
    }
  }

  handleGutterClick (ev: MouseEvent) {
    const editorView = atom.views.getView(this._editor)
    const file = this._editor.getPath()
    if (file == null || !editorView || !editorView.component) {
      return
    }
    const position = this._editor.bufferPositionForScreenPosition(
      editorView.component.screenPositionForMouseEvent(ev)
    )

    this._dbg.toggleBreakpoint(file, position.row)
  }
  handleMarkerDidChange (name: string, event: { isValid: boolean, newHeadBufferPosition: atom$Point }) {
    if (event.isValid === false) {
      // marker is not valid anymore - text at marker got
      // replaced or was removed -> remove the breakpoint
      this._dbg.removeBreakpoint(name)
      return
    }

    this._dbg.editBreakpoint(name, { line: event.newHeadBufferPosition.row })
  }
}
