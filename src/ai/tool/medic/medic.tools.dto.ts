import z from 'zod'

export default z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  execution: z.function().args(z.string()).returns(z.promise(z.string())),
})
