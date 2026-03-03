/**
 * 标准响应工具
 */

const success = (data = null, message = 'success') => {
  return {
    code: 0,
    message,
    data
  };
};

const error = (message = 'error', code = 500, data = null) => {
  return {
    code,
    message,
    data
  };
};

const pagination = (list, pagination) => {
  return {
    code: 0,
    message: 'success',
    data: {
      list,
      pagination
    }
  };
};

module.exports = {
  success,
  error,
  pagination
};
