const maskPhone = (phone) => {
  const value = `${phone || ''}`.trim()
  if (!value) {
    return ''
  }

  if (value.length < 7) {
    return value
  }

  return `${value.slice(0, 3)}****${value.slice(-4)}`
}

const maskName = (name) => {
  const value = `${name || ''}`.trim()
  if (!value) {
    return ''
  }

  if (value.length === 1) {
    return '*'
  }

  if (value.length === 2) {
    return `${value[0]}*`
  }

  return `${value[0]}${'*'.repeat(value.length - 2)}${value[value.length - 1]}`
}

const maskIdCard = (idCard) => {
  const value = `${idCard || ''}`.trim()
  if (!value || value.length < 8) {
    return value
  }

  return `${value.slice(0, 4)}********${value.slice(-4)}`
}

const sanitizeForLog = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return payload
  }

  const clone = JSON.parse(JSON.stringify(payload))
  const fields = ['phone', 'mobile', 'idCard', 'name', 'patientName']

  fields.forEach((field) => {
    if (!clone[field]) {
      return
    }

    if (field === 'phone' || field === 'mobile') {
      clone[field] = maskPhone(clone[field])
    } else if (field === 'idCard') {
      clone[field] = maskIdCard(clone[field])
    } else {
      clone[field] = maskName(clone[field])
    }
  })

  return clone
}

module.exports = {
  maskPhone,
  maskName,
  maskIdCard,
  sanitizeForLog
}
