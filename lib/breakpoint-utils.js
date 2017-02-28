'use babel'

import { shortenPath } from './utils'

export function position (bp) {
  return `${shortenPath(bp.file)}:${bp.line + 1}`
}
