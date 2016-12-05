'use babel'

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
  // allow using a custom dlv executable
  const customDlvPath = atom.config.get('go-debug.dlvPath')
  if (customDlvPath) {
    return Promise.resolve(customDlvPath)
  }
  return locate(goconfig).then((p) => {
    if (p) {
      return p
    }

    // check if GOPATH is actually available in goconfig!
    if (!assertGOPATH(goconfig)) {
      return Promise.reject('Environment variable "GOPATH" is not available!')
    }

    if (process.platform === 'darwin') {
      return getOnOSX(goconfig)
    }

    return goget.get({
      name: 'go-debug',
      packageName: 'dlv',
      packagePath: 'github.com/derekparker/delve/cmd/dlv',
      type: 'missing'
    }).then((r) => {
      if (!r.success) {
        return Promise.reject('Failed to install "dlv" via "go get -u github.com/derekparker/delve/cmd/dlv". Please install it manually.\n' + r.result.stderr)
      }
      return locate(goconfig)
    })
  })
}
function getOnOSX (goconfig) {
  // delve is not "go get"-able on OSX yet as it needs to be signed to use it...
  // alternative: use a prebuilt dlv executable -> https://bintray.com/jetbrains/golang/delve

  return new Promise((resolve, reject) => {
    const request = require('request')
    const AdmZip = require('adm-zip')
    const path = require('path')
    const fs = require('fs')

    function start () {
      Promise.all([
        getVersion().then(download),
        getGoPath()
      ])
        .then((results) => extract(results[0], results[1]))
        .catch(reject)
    }

    // get latest version
    function getVersion () {
      return new Promise(function (resolve, reject) {
        const url = 'https://api.bintray.com/packages/jetbrains/golang/delve/versions/_latest'
        request(url, (error, response, body) => {
          if (error || response.statusCode !== 200) {
            reject(error || 'Failed to determine the latest version from bintray!')
            return
          }
          resolve(JSON.parse(body).name)
        })
      })
    }

    // download the latest version
    function download (version) {
      const o = {
        url: 'https://dl.bintray.com/jetbrains/golang/com/jetbrains/delve/' + version + '/delve-' + version + '.zip',
        encoding: null
      }
      return new Promise(function (resolve, reject) {
        request(o, (error, response, body) => {
          if (error || response.statusCode !== 200) {
            reject(error || 'Failed to download the latest dlv executable from bintray!')
            return
          }
          resolve(body)
        })
      })
    }

    function getGoPath () {
      return new Promise(function (resolve) {
        const paths = goconfig.environment().GOPATH.split(path.delimiter)
        if (paths.length === 1) {
          resolve(paths[0])
          return
        }
        const options = paths.map((p, i) => `<option value="${i}">${p}</option>`).join('')

        // poor mans modal as the notification is not customizable ... I will not put
        // too much effort into this as it will (hopefully) not be needed in the future
        var item = document.createElement('div')
        item.innerHTML = `<p>Multiple GOPATHs detected, where do you want to put the "dlv" executable?</p>
          <select class="go-debug-mutliple-gopath-selector btn">
            <option value="">Select a path ...</option>
            ${options}
          </select>
          <button type="button" class="go-debug-mutliple-gopath-btn btn">OK</button>`

        const panel = atom.workspace.addModalPanel({ item })

        item.querySelector('.go-debug-mutliple-gopath-btn').addEventListener('click', () => {
          const { value } = item.querySelector('.go-debug-mutliple-gopath-selector')
          resolve(value ? paths[value] : null)
          panel.destroy()
        })
      })
    }

    // extract zip
    function extract (body, gopath) {
      if (!gopath) {
        resolve(null)
        return
      }
      const zip = new AdmZip(body)

      // copy mac/dlv to $GOPATH/bin
      try {
        const binPath = path.join(gopath, 'bin')
        zip.extractEntryTo('dlv/mac/dlv', binPath, false, true)
      } catch (e) {
        reject(e)
        return
      }

      locate(goconfig).then(updatePermission).catch(reject)
    }

    // update the file permissions to be able to execute dlv
    function updatePermission (path) {
      if (!path) {
        reject('Failed to find delve executable "dlv" in your GOPATH')
        return
      }
      fs.chmod(path, 0o777, (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve(path)
      })
    }

    const noti = atom.notifications.addWarning(
      'Could not find delve executable "dlv" in your GOPATH!',
      {
        dismissable: true,
        onDidDismiss: () => resolve(null),
        description: 'Do you want to install a prebuilt/signed dlv executable from https://bintray.com/jetbrains/golang/delve ?',
        buttons: [
          {
            text: 'Yes',
            onDidClick: () => {
              noti.dismiss()
              start()
            }
          },
          {
            text: 'No',
            onDidClick: () => {
              noti.dismiss()
              resolve(null)
            }
          }
        ]
      }
    )
  })
}
