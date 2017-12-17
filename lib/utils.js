/* @flow */

import path from 'path'
import type { TextEditor } from 'atom'

const REGEX_TO_INDEX = /\[["']?(\w+)["']?]/g
const REGEX_LEADING_DOT = /^\./
export function getDeep (o: ?Object, path: string): ?mixed {
  let p = path
    // convert indexes to properties (like a["b"]['c'][0])
    .replace(REGEX_TO_INDEX, '.$1')
    // strip a leading dot (as it might occur because of the previous replace)
    .replace(REGEX_LEADING_DOT, '')
    .split('.')

  var obj = o
  while (obj && p.length) {
    var n = p.shift()
    obj = obj[n]
  }
  return obj
}

export function elementPropInHierarcy (element: Element, prop: string): mixed {
  const el = eachElementInHierarchy(element, (el) => getDeep(el, prop) !== undefined)
  return getDeep(el, prop)
}

export function eachElementInHierarchy (element: Element, fn: (element: Element) => boolean): ?Element {
  let el: ?Element = element
  while (el && !fn(el)) {
    el = el.parentElement
  }
  return el
}

export function shortenPath (file: string): string {
  return path.normalize(file).split(path.sep).slice(-2).join(path.sep)
}
export function location (file: string | { file: string, line: number }, line?: number) {
  if (typeof file === 'object') {
    return `${shortenPath(file.file)}:${file.line + 1}`
  }
  return `${shortenPath(file)}:${line + 1}`
}

export function debounce (func: Function, wait: number): Function {
  if (!wait) {
    return func
  }
  let timeout
  const fn = function () {
    const context = this
    const args = arguments
    fn.cancel()
    timeout = setTimeout(() => {
      timeout = null
      func.apply(context, args)
    }, wait)
  }
  fn.cancel = () => clearTimeout(timeout)
  return fn
}

declare type ComparerFn = (oldValue: any, newValue: any) => boolean
declare type Comparer = { [key: string]: ComparerFn }

/**
 * Checks if at least the all keys in the new object strict equal exist in the old object
 * @param  {Object} [oldObject] The old object
 * @param  {Object} [newObject] The new object
 * @return {bool}
 */
export function shallowEqual (oldObject: ?any, newObject: ?any, comparer?: Comparer): boolean {
  if (!oldObject && !newObject) {
    return true
  }
  if (!oldObject || !newObject) {
    return false
  }
  const newKeys = Object.keys(newObject).sort()
  const oldKeys = Object.keys(oldObject)

  // check if all keys are in the old object
  if (!newKeys.every((key) => oldKeys.includes(key))) {
    return false
  }

  return newKeys.every((key) => {
    if (comparer && key in comparer) {
      return comparer[key](oldObject[key], newObject[key])
    }
    return newObject[key] === oldObject[key]
  })
}

let style
export function editorStyle () {
  if (!style) {
    const fontSize = atom.config.get('editor.fontSize')
    style = {
      'font-family': atom.config.get('editor.fontFamily'),
      'font-size': typeof fontSize === 'number' ? fontSize + 'px' : '',
      'line-height': atom.config.get('editor.lineHeight')
    }
  }
  return style
}

export function getEditor () {
  return atom.workspace.getActiveTextEditor() || atom.workspace.getCenter().getActiveTextEditor()
}

export function openFile (file: string, line: number, column?: number = 0): Promise<TextEditor> {
  return atom.workspace.open(file, { initialLine: line, searchAllPanes: true }).then((editor) => {
    editor.scrollToBufferPosition([line, column], { center: true })
    return editor
  })
}

export function isValidEditor (e: TextEditor) {
  if (!e || !e.getGrammar) {
    return false
  }
  const grammar = e.getGrammar()
  if (!grammar) {
    return false
  }
  return grammar.scopeName === 'source.go'
}

export function saveAllEditors () {
  const promises = []
  for (const editor of atom.workspace.getTextEditors()) {
    if (editor.isModified() && isValidEditor(editor)) {
      promises.push(editor.save())
    }
  }
  return Promise.all(promises)
}

export function assign<T> (a: T, ...b: $Shape<T>[]): T {
  return Object.assign({}, a, ...b)
}

export function updateArrayItem<T> (array: T[], index: number, o: $Shape<T>): T[] {
  if (index === -1) {
    return array
  }
  return array.slice(0, index).concat(
    assign(array[index], o),
    array.slice(index + 1)
  )
}

export function removeArrayItem<T> (array: T[], index: number): T[] {
  return index === -1 ? array : array.slice(0, index).concat(array.slice(index + 1))
}
