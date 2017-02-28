'use babel'

import * as semver from 'semver'

const MIN_VERSION = '0.12.0'

function locate (goconfig) {
  return goconfig.locator.findTool('dlv')
}

function assertGOPATH (goconfig) {
  if (goconfig.environment().GOPATH) {
    return true
  }

  atom.notifications.addWarning(
    'The environment variable "GOPATH" is not set!',
    {
      dismissable: true,
      description: 'Starting atom via a desktop icon might not pass "GOPATH" to atom!\nTry starting atom from the command line instead.'
    }
  )
  return false
}

export default function getDelve (goget, goconfig) {
  // check if GOPATH is actually available in goconfig!
  if (!assertGOPATH(goconfig)) {
    return Promise.reject(new Error('Environment variable "GOPATH" is not available!'))
  }

  // allow using a custom dlv executable
  const customDlvPath = atom.config.get('go-debug.dlvPath')
  if (customDlvPath) {
    return Promise.resolve(customDlvPath)
  }
  return locate(goconfig)
    .then((p) => {
      if (p) {
        return getVersion(goconfig)
          .then((version) => update(goget, goconfig, version))
          .then(() => p)
      }
      return install(goget, goconfig)
        .then(() => locate(goconfig))
    })
}

function getVersion (goconfig) {
  return goconfig.executor.exec('dlv', ['version'], 'project').then((r) => {
    if (r.exitcode !== 0) {
      return Promise.reject(r.stderr)
    }
    const prefixVersion = 'Version: '
    return r.stdout
      .split('\n')
      .find((l) => l.startsWith(prefixVersion))
      .substr(prefixVersion.length)
  })
}

function install (goget, goconfig) {
  if (process.platform === 'darwin') {
    // delve is not "go get"-able on OSX yet as it needs to be signed
    atom.notifications.addError(
      'Could not find delve executable "dlv" in your GOPATH!',
      {
        dismissable: true,
        description: 'Please install it by following the instructions on ' +
          'https://github.com/derekparker/delve/blob/master/Documentation/installation/osx/install.md'
      }
    )
    return Promise.reject(new Error('Could not find delve executable "dlv" in your GOPATH!'))
  }

  return goget.get({
    name: 'go-debug',
    packageName: 'dlv',
    packagePath: 'github.com/derekparker/delve/cmd/dlv',
    type: 'missing'
  }).then((r) => {
    if (r && !r.success) {
      return Promise.reject(new Error(
        'Failed to install "dlv" via "go get -u github.com/derekparker/delve/cmd/dlv". ' +
        'Please install it manually by following the instructions on ' +
        'https://github.com/derekparker/delve/blob/master/Documentation/installation/README.md\n' + r.result.stderr
      ))
    }
  })
}

function update (goget, goconfig, version) {
  if (semver.gte(version, MIN_VERSION)) {
    return Promise.resolve()
  }
  return goget.get({
    name: 'go-debug',
    packageName: 'dlv',
    packagePath: 'github.com/derekparker/delve/cmd/dlv',
    type: 'outdated'
  }).then((r) => {
    if (r && !r.success) {
      return Promise.reject(new Error(
        'Failed to update "dlv" via "go get -u github.com/derekparker/delve/cmd/dlv". ' +
        'Please update it manually by following the instructions on ' +
        'https://github.com/derekparker/delve/blob/master/Documentation/installation/README.md\n' + r.result.stderr
      ))
    }
  })
}
