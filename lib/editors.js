'use babel'

import { CompositeDisposable } from 'atom'
import { store, indexOfBreakpoint, getBreakpoints } from './store'
import * as Delve from './delve'
import { debounce } from './utils'

const editors = new Map()

function observeTextEditors (editor) {
  const grammar = editor.getGrammar()
  if (grammar.scopeName !== 'source.go') {
    return
  }
  if (editors.has(editor)) {
    // update the editor
    updateMarkers(editor)
    return
  }

  const o = {
    markers: [], // contains the breakpoint markers
    gutter: editor.addGutter({ name: 'go-debug', priority: -100 })
  }
  editors.set(editor, o)

  updateMarkers(editor)

  const gutterView = atom.views.getView(o.gutter)
  gutterView.addEventListener('click', onGutterClick.bind(null, editor))
}

function onWillDestroyPaneItem ({ item: editor }) {
  const file = editor && editor.getPath && editor.getPath()
  if (file) {
    destroyEditor(editors.get(editor))
    editors.delete(editor)
  }
}

let lastStackPC

let lineMarker
const removeLineMarker = () => lineMarker && lineMarker.destroy()

function openAndHighlight (stack) {
  if (!stack) {
    // finished or just started -> no line marker visible
    removeLineMarker()
    lastStackPC = 0
    return
  }

  if (stack.pc === lastStackPC) {
    return
  }
  lastStackPC = stack.pc

  // remove any previous line marker
  removeLineMarker()

  // open the file
  const line = stack.line - 1 // dlv = 1 indexed line / atom = 0 indexed line
  atom.workspace.open(stack.file, { initialLine: line, searchAllPanes: true }).then(() => {
    // create a new marker
    const editor = atom.workspace.getActiveTextEditor()
    lineMarker = editor.markBufferPosition({ row: line })
    editor.decorateMarker(lineMarker, { type: 'line', class: 'go-debug-debug-line' })

    // center the line
    editor.scrollToBufferPosition([line, 0], { center: true })
  })
}

function updateMarkers (editor) {
  const bps = getBreakpoints(editor && editor.getPath())

  // update and add markers
  bps.forEach((bp) => updateMarker(editor, bp.file, bp.line, bp))

  // remove remaining
  const file = editor.getPath()
  const editorBps = editors.get(editor).markers
  editorBps.forEach(({ line }) => {
    if (indexOfBreakpoint(bps, file, line) === -1) {
      updateMarker(editor, file, line)
    }
  })
}

function updateMarker (editor, file, line, bp) {
  const o = editors.get(editor)
  if (!o) {
    return // editor not visible, nothing to show
  }

  const index = o.markers.findIndex(({ line: l }) => l === line)
  const marker = o.markers[index]
  if (!bp) {
    if (marker) {
      marker.decoration.getMarker().destroy()
    }
    o.markers.splice(index, 1)
    return
  }

  const el = document.createElement('div')
  el.className = 'go-debug-breakpoint go-debug-breakpoint-state-' + bp.state
  el.dataset.state = bp.state
  el.title = bp.message || '' // TODO: add texts for other breakpoint states
  const decoration = {
    class: 'go-debug-gutter-breakpoint',
    item: el
  }

  if (!marker) {
    // create a new decoration
    const marker = editor.markBufferPosition({ row: line })
    marker.onDidChange(debounce(onMarkerDidChange.bind(null, { file, line, marker }), 50))
    o.markers.push({
      marker,
      line,
      bp,
      decoration: o.gutter.decorateMarker(marker, decoration)
    })
  } else {
    // check if the breakpoint has even changed
    if (marker.bp === bp) {
      return
    }
    marker.bp = bp

    // update an existing decoration
    marker.decoration.setProperties(Object.assign(
      {},
      marker.decoration.getProperties(),
      decoration
    ))
  }
}

function onMarkerDidChange ({ file, line, marker }, event) {
  if (!event.isValid) {
    // marker is not valid anymore - text at marker got
    // replaced or was removed -> remove the breakpoint
    Delve.removeBreakpoint(file, line)
    return
  }

  Delve.updateBreakpointLine(file, line, marker.getStartBufferPosition().row)
}

const debouncedStoreChange = debounce(() => {
  editors.forEach((o, editor) => updateMarkers(editor))

  // open the file of the selected stacktrace and highlight the current line
  const state = store.getState()
  openAndHighlight(state.delve.stacktrace[state.delve.selectedStacktrace])
}, 50)

let subscriptions
export function init () {
  subscriptions = new CompositeDisposable(
    atom.workspace.observeTextEditors(observeTextEditors),
    atom.workspace.onWillDestroyPaneItem(onWillDestroyPaneItem),
    { dispose: store.subscribe(debouncedStoreChange) }
  )
}
export function dispose () {
  editors.forEach(destroyEditor)
  editors.clear()

  removeLineMarker()
  lineMarker = null

  subscriptions.dispose()
  subscriptions = null
}

function destroyEditor (o) {
  if (!o) {
    return
  }

  try {
    o.gutter.destroy()
  } catch (e) {
    console.warn('go-debug', e)
  }

  // remove all breakpoint decorations (marker)
  o.markers.forEach((bp) => bp.decoration.getMarker().destroy())
}

function onGutterClick (editor, ev) {
  const editorView = atom.views.getView(editor)
  let { row: line } = editorView.component.screenPositionForMouseEvent(ev)
  line = editor.bufferRowForScreenRow(line)

  // TODO: conditions via right click menu?

  const file = editor.getPath()
  const o = editors.get(editor)
  const deco = o.markers.find(({ line: l }) => l === line)
  if (deco) {
    Delve.removeBreakpoint(file, line)
    return
  }

  Delve.addBreakpoint(file, line)
}
