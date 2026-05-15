import jwt from '@elysiajs/jwt'

export const lib_jwt = jwt({
  secret: process.env.JWT_SECRET_KEY!,
  exp: '1d',
})
