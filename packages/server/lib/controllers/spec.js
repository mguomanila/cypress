const debug = require('debug')('cypress:server:controllers:spec')
const Promise = require('bluebird')
const errors = require('../errors')
const preprocessor = require('../plugins/preprocessor')

module.exports = {
  handle (spec, req, res, config, next, onError) {
    debug('request for %o', { spec })

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    })

    res.type('js')

    return preprocessor
    .getFile(spec, config)
    .then((filePath) => {
      debug('sending spec %o', { filePath })
      const sendFile = Promise.promisify(res.sendFile.bind(res))

      return sendFile(filePath)
    }).catch({ code: 'ECONNABORTED' }, (err) => {
      // https://github.com/cypress-io/cypress/issues/1877
      // now that we are properly catching errors from
      // res.sendFile, sendFile will reject if the browser aborts
      // its internal requests (as it shuts down) with
      // ECONNABORTED. This happens because if a previous spec
      // file is unable to be transpiled correctly, we immediately
      // shut down the run, which closes the browser, triggering
      // the browser to abort the request which would end up here
      // and display two different errors.
    }).catch((err) => {
      if (!config.isTextTerminal) {
        return res.send(preprocessor.clientSideError(err))
      }

      // bluebird made a change in 3.4.7 where they handle
      // SyntaxErrors differently here
      // https://github.com/petkaantonov/bluebird/pull/1295
      //
      // their new behavior messes up how we show these errors
      // so we must backup the original stack and replace it here
      if (err.originalStack) {
        err.stack = err.originalStack
      }

      const filePath = err.filePath != null ? err.filePath : spec

      err = errors.get('BUNDLE_ERROR', filePath, preprocessor.errorMessage(err))

      onError(err)
    })
  },
}
