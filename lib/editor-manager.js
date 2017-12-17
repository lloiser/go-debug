/* @flow */

import { CompositeDisposable, TextEditor } from 'atom'
import { openFile, isValidEditor } from './utils'
import { subscribePath, subscribeFn } from './store-utils'
import { Editor } from './editor'

import type { Store } from './store'
import type { Debugger } from './debugger'
import type { State, Stacktrace } from './debugger-flow-types'

export class EditorManager {
  _store: Store
  _dbg: Debugger

  _editors: Map<TextEditor, Editor>
  _subscriptions: ?CompositeDisposable

  _activeLine: {
    stackID: number,
    marker: ?atom$Marker
  }

  constructor (store: Store, dbg: Debugger) {
    this._store = store
    this._dbg = dbg

    this._editors = new Map()

    this._subscriptions = new CompositeDisposable(
      atom.workspace.observeTextEditors(this.handleTextEditor.bind(this)),
      atom.workspace.onWillDestroyPaneItem(this.handleWillDestroyPaneItem.bind(this)),
      subscribePath(store, 'delve.breakpoints', this.handleBreakpointsChange.bind(this)),
      subscribeFn(store, (state: State): ?Stacktrace => {
        const { delve: { stacktrace, selectedStacktrace } } = state
        return stacktrace[selectedStacktrace]
      }, this.handleStacktraceChange.bind(this)),
    )

    this._activeLine = {
      stackID: 0,
      marker: null
    }
  }

  dispose () {
    this._editors.forEach((e) => e.destroy())
    this._editors.clear()

    this.removeActiveLine()

    if (this._subscriptions) {
      this._subscriptions.dispose()
      this._subscriptions = null
    }
  }

  handleBreakpointsChange () {
    this._editors.forEach((e, editor) => {
      this.getEditor(editor)
      e.updateMarkers()
    })
  }

  removeActiveLine () {
    if (this._activeLine.marker) {
      this._activeLine.marker.destroy()
    }
    this._activeLine.stackID = 0
    this._activeLine.marker = null
  }

  handleStacktraceChange (stack: ?Stacktrace) {
    if (!stack) {
      // no stacktrace available
      this.removeActiveLine()
      return
    }

    if (this._activeLine.stackID === stack.id) {
      // nothing has changed
      return
    }
    this._activeLine.stackID = stack.id

    // open the file
    const { file, line } = stack
    openFile(file, line).then((editor) => {
      // remove any previous line marker
      this.removeActiveLine()
      // create a new marker
      const marker = editor.markBufferPosition([line, 0])
      editor.decorateMarker(marker, { type: 'line', class: 'go-debug-line' })
      this._activeLine.marker = marker
    })
  }

  handleWillDestroyPaneItem (o: { item: mixed }) {
    const { item: editor } = o
    if (!(editor instanceof TextEditor)) {
      return
    }
    const e = this._editors.get(editor)
    if (e) {
      e.destroy()
      this._editors.delete(editor)
    }
  }

  handleTextEditor (editor: TextEditor) {
    const e = this.getEditor(editor)
    if (e) {
      e.updateMarkers()
    }
  }

  getEditor (editor: TextEditor) {
    if (!isValidEditor(editor)) {
      return null
    }

    let e = this._editors.get(editor)
    if (!e) {
      e = new Editor(this._store, this._dbg, editor)
      this._editors.set(editor, e)
    }
    return e
  }
}
