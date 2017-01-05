'use babel'

import { indexOfBreakpointByID, getBreakpoints } from './store-helper'
import { debounce } from './utils'

export default class Editor {
  constructor (store, dbg, editor) {
    this._store = store
    this._dbg = dbg
    this._editor = editor

    this._markers = {} // contains the breakpoint markers by their breakpoint id

    this._gutter = this._editor.addGutter({ name: 'debug', priority: -100 })
    const gutterView = atom.views.getView(this._gutter)
    gutterView.addEventListener('click', this.handleGutterClick.bind(this))
  }
  destroy () {
    // remove all breakpoint decorations (marker)
    Object.keys(this._markers).forEach((id) => this._markers[id].decoration.getMarker().destroy())

    this.destroyGutter()
  }
  destroyGutter () {
    if (!this._gutter) {
      return
    }

    try {
      this._gutter.destroy()
    } catch (e) {
      console.warn('debug', e)
    }

    this._gutter = null
  }

  createMarkerDecoration (bp) {
    const el = document.createElement('div')
    el.className = 'go-debug-breakpoint go-debug-breakpoint-state-' + bp.state
    el.dataset.id = bp.id
    el.title = bp.message || ''
    return {
      class: 'go-debug-gutter-breakpoint',
      item: el
    }
  }

  updateMarkers () {
    const file = this._editor.getPath()
    const bps = getBreakpoints(this._store, file)

    // update and add markers
    bps.forEach((bp) => this.updateMarker(bp))

    // remove remaining
    Object.keys(this._markers).forEach((id) => {
      const index = indexOfBreakpointByID(bps, id)
      if (index === -1) {
        this.removeMarker(id)
      }
    })
  }
  updateMarker (bp) {
    const decoration = this.createMarkerDecoration(bp)
    let marker = this._markers[bp.id]

    // create a new decoration
    if (!marker) {
      let m = this._editor.markBufferPosition({ row: bp.line })
      m.onDidChange(debounce(this.handleMarkerDidChange.bind(this, bp.id), 50))
      this._markers[bp.id] = {
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

  removeMarker (id) {
    const marker = this._markers[id]
    if (marker) {
      marker.decoration.getMarker().destroy()
      delete this._markers[id]
    }
  }

  handleGutterClick (ev) {
    const editorView = atom.views.getView(this._editor)
    let { row: line } = editorView.component.screenPositionForMouseEvent(ev)
    line = this._editor.bufferRowForScreenRow(line)

    // TODO: conditions via right click menu!

    this._dbg.toggleBreakpoint(this._editor.getPath(), line)
  }
  handleMarkerDidChange (id, event) {
    if (!event.isValid) {
      // marker is not valid anymore - text at marker got
      // replaced or was removed -> remove the breakpoint
      this._dbg.removeBreakpoint(id)
      return
    }

    this._dbg.updateBreakpointLine(id, event.newHeadBufferPosition.row)
  }
}
