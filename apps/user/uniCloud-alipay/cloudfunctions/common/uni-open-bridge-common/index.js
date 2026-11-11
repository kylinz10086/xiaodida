const createConfig = require('uni-config-center')

const uniIdConfig = createConfig({
  pluginId: 'uni-id'
})

class UniOpenBridgeCommon {
  constructor() {
    this._config = {}
  }
  
  init() {
    return this
  }
  
  setSessionKey() {
    return Promise.resolve()
  }
  
  getSessionKey() {
    return Promise.resolve()
  }
  
  removeSessionKey() {
    return Promise.resolve()
  }
  
  setAccessToken() {
    return Promise.resolve()
  }
  
  getAccessToken() {
    return Promise.resolve()
  }
  
  removeAccessToken() {
    return Promise.resolve()
  }
  
  setRefreshToken() {
    return Promise.resolve()
  }
  
  getRefreshToken() {
    return Promise.resolve()
  }
  
  removeRefreshToken() {
    return Promise.resolve()
  }
}

module.exports = new UniOpenBridgeCommon()
