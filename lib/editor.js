'use babel'

import { indexOfBreakpoint, getBreakpoints } from './store-helper'
import { debounce } from './utils'

export default class Editor {
  constructor (store, dbg, editor) {
    this._store = store
    this._dbg = dbg
    this._editor = editor

    this._markers = [] // contains the breakpoint markers

    this._gutter = this._editor.addGutter({ name: 'debug', priority: -100 })
    const gutterView = atom.views.getView(this._gutter)
    gutterView.addEventListener('click', this.handleGutterClick.bind(this))
  }
  destroy () {
    // remove all breakpoint decorations (marker)
    this._markers.forEach((bp) => bp.decoration.getMarker().destroy())

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
    el.dataset.state = bp.state
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
    this._markers.forEach(({ bp }) => {
      const index = indexOfBreakpoint(bps, bp.file, bp.line)
      if (index === -1) {
        this.removeMarker(bp)
      }
    })
  }
  updateMarker (bp) {
    const decoration = this.createMarkerDecoration(bp)
    let marker = this._markers.find(({ bp: markerBP }) => markerBP.line === bp.line)

    // create a new decoration
    if (!marker) {
      marker = this._editor.markBufferPosition({ row: bp.line })
      marker.onDidChange(debounce(this.handleMarkerDidChange.bind(this, marker), 50))
      this._markers.push({
        marker,
        bp,
        decoration: this._gutter.decorateMarker(marker, decoration)
      })
      return
    }

    // update an existing decoration
    // check if the breakpoint has even changed
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

  removeMarker (bp) {
    const markers = this._markers
    const index = markers.findIndex(({ bp: markerBP }) => markerBP.line === bp.line)
    const marker = markers[index]
    if (marker) {
      marker.decoration.getMarker().destroy()
    }
    markers.splice(index, 1)
  }

  handleGutterClick (ev) {
    const editorView = atom.views.getView(this._editor)
    let { row: line } = editorView.component.screenPositionForMouseEvent(ev)
    line = this._editor.bufferRowForScreenRow(line)

    // TODO: conditions via right click menu!

    this.toggleBreakpoint(line)
  }
  handleMarkerDidChange (marker, event) {
    const { bp: { file, line } } = this._markers.find((m) => m.marker === marker)
    if (!event.isValid) {
      // marker is not valid anymore - text at marker got
      // replaced or was removed -> remove the breakpoint
      this._dbg.removeBreakpoint(file, line)
      return
    }

    this._dbg.updateBreakpointLine(file, line, marker.getStartBufferPosition().row)
  }

  toggleBreakpoint (line) {
    const file = this._editor.getPath()
    const marker = this._markers.find(({ bp }) => bp.line === line)
    if (marker) {
      this._dbg.removeBreakpoint(file, line)
      return
    }

    this._dbg.addBreakpoint(file, line)
  }
}
