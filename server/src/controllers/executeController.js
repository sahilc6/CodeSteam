const { runCode } = require('../sandbox/runner')
const Joi = require('joi')
const logger = require('../utils/logger')

const SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'cpp',
  'c', 'go', 'rust', 'ruby', 'php', 'bash',
]

const schema = Joi.object({
  code: Joi.string().max(50000).required(),
  language: Joi.string().valid(...SUPPORTED_LANGUAGES).required(),
  stdin: Joi.string().max(10000).allow('').default(''),
})

async function executeCode(req, res) {
  const { error, value } = schema.validate(req.body)
  if (error) return res.status(400).json({ error: error.details[0].message })

  try {
    const result = await runCode(value.language, value.code, value.stdin)
    res.json(result)
  } catch (err) {
    logger.error('executeCode error:', err)
    res.status(500).json({ error: 'Execution failed', stderr: err.message })
  }
}

module.exports = { executeCode }
