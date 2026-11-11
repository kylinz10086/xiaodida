export default {
  debug: false,
  isAdmin: false,
  loginTypes: [
    'weixin',
    'smsCode'
  ],
  agreements: {
    serviceUrl: '',
    privacyUrl: '',
    scope: [
      'register', 'login'
    ]
  },
  appid: {
    weixin: {
      h5: 'wx1522085c63f2759b',
      web: 'wx1522085c63f2759b'
    }
  },
  passwordStrength: 'weak',
  setPasswordAfterLogin: false,
  webWXAuthBackDomain: ''
}
