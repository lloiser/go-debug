'use babel'

import { CompositeDisposable } from 'atom'
import { debounce, openFile, isValidEditor } from './utils'
import Editor from './editor'

export default class EditorManager {
  constructor (store, dbg) {
    this._store = store
    this._dbg = dbg

    this._editors = new Map()

    this._subscriptions = new CompositeDisposable(
      atom.workspace.observeTextEditors(this.handleTextEditor.bind(this)),
      atom.workspace.onWillDestroyPaneItem(this.handleWillDestroyPaneItem.bind(this)),
      {
        dispose: store.subscribe(
          debounce(this.handleStoreChange.bind(this), 50)
        )
      }
    )

    this._lastStackID = 0
    this._lineMarker = null
  }

  dispose () {
    this._editors.forEach((e) => e.destroy())
    this._editors.clear()

    this.removeLineMarker()

    this._subscriptions.dispose()
    this._subscriptions = null
  }

  handleStoreChange () {
    this._editors.forEach((e, editor) => {
      this.updateEditor(editor)
      e.updateMarkers()
    })

    // open the file of the selected stacktrace and highlight the current line
    this.openAndHighlight()
  }

  removeLineMarker () {
    if (this._lineMarker) {
      this._lineMarker.destroy()
    }
    this._lineMarker = null
  }

  openAndHighlight () {
    const delve = this._store.getState().delve
    const stack = delve.stacktrace[delve.selectedStacktrace]
    if (!stack) {
      // not started, finished or just started -> no line marker visible
      this.removeLineMarker()
      this._lastStackID = 0
      return
    }

    if (stack.id === this._lastStackID) {
      return
    }
    this._lastStackID = stack.id

    // remove any previous line marker
    this.removeLineMarker()

    // open the file
    const line = stack.line
    openFile(stack.file, line).then((editor) => {
      // create a new marker
      this._lineMarker = editor.markBufferPosition({ row: line })
      editor.decorateMarker(this._lineMarker, { type: 'line', class: 'go-debug-line' })
    })
  }

  handleWillDestroyPaneItem ({ item: editor }) {
    const e = editor && this._editors.get(editor)
    if (e) {
      e.destroy()
      this._editors.delete(editor)
    }
  }

  handleTextEditor (editor) {
    const e = this.updateEditor(editor)
    if (e) {
      e.updateMarkers()
    }
  }

  updateEditor (editor) {
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
