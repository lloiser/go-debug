'use babel'

import path from 'path'

const REGEX_TO_INDEX = /\[["']?(\w+)["']?]/g
const REGEX_LEADING_DOT = /^\./
export function getDeep (o, path) {
  path = path
    // convert indexes to properties (like a["b"]['c'][0])
    .replace(REGEX_TO_INDEX, '.$1')
    // strip a leading dot (as it might occur because of the previous replace)
    .replace(REGEX_LEADING_DOT, '')
    .split('.')

  var obj = o
  while (obj && path.length) {
    var n = path.shift()
    obj = obj[n]
  }
  return obj
}

export function elementPropInHierarcy (element, prop) {
  const el = eachElementInHierarchy(element, (el) => getDeep(el, prop) !== undefined)
  return getDeep(el, prop)
}

export function eachElementInHierarchy (element, fn) {
  while (element && !fn(element)) {
    element = element.parentElement
  }
  return element
}

export function shortenPath (file) {
  return path.normalize(file).split(path.sep).slice(-2).join(path.sep)
}
export function location (file, line) {
  if (typeof file === 'object') {
    ({ file, line } = file)
  }
  return `${shortenPath(file)}:${line + 1}`
}

export function debounce (func, wait) {
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

/**
 * Checks if at least the all keys in new props strict equal exist in the old props
 * @param  {Object} [oldProps={}] The old props
 * @param  {Object} [newProps={}] The new props
 * @return {bool}
 */
export function shallowEqual (oldProps = {}, newProps = {}) {
  const newKeys = Object.keys(newProps).sort()
  const oldKeys = Object.keys(oldProps).sort()

  // check if all keys are in the old props
  if (!newKeys.every((key) => oldKeys.includes(key))) {
    return false
  }

  return newKeys.every((key) => newProps[key] === oldProps[key])
}

let style
export function editorStyle () {
  if (!style) {
    style = {
      'font-family': atom.config.get('editor.fontFamily'),
      'font-size': atom.config.get('editor.fontSize') + 'px',
      'line-height': atom.config.get('editor.lineHeight')
    }
  }
  return style
}

export function getEditor () {
  return atom.workspace.getActiveTextEditor() || atom.workspace.getCenter().getActiveTextEditor()
}

export function openFile (file, line, column) {
  return atom.workspace.open(file, { initialLine: line, searchAllPanes: true }).then((editor) => {
    editor.scrollToBufferPosition([line, column], { center: true })
    return editor
  })
}

export function isValidEditor (e) {
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
