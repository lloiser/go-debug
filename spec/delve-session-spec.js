'use babel'
/* eslint-env jasmine */

import DelveSession from '../lib/delve-session'

describe('', () => {
  let delveProcess, connection
  let session

  beforeEach(() => {
    delveProcess = jasmine.createSpyObj('process', ['kill'])
    connection = jasmine.createSpyObj('connection', ['end', 'call'])

    session = new DelveSession(delveProcess, connection, 'test')
  })

  it('stops after timeout if detach takes too long', () => {
    // GIVEN: the request to delve to detach the current running debug session does not finish within a timeout
    let calledDetach = false
    connection.call.andCallFake((method, args, callback) => {
      calledDetach = true
      expect(method).toEqual('RPCServer.Detach')
      // do not call the callback
    })

    // WHEN: I stop the delve session
    const stoppingPromise = session.stop()

    advanceClock(1001) // trigger the timeout

    waitsForPromise(() => stoppingPromise)

    // THEN: I expect a default timeout to kick in that ends the connection and kills the delve process
    runs(() => {
      expect(connection.end).toHaveBeenCalled()
      expect(delveProcess.kill).toHaveBeenCalled()
      expect(calledDetach).toBeTruthy()
    })
  })
})
