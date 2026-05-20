function stripAnsi(str) {
  return str
    .replace(/[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .replace(/[][[\]].*?(?:|\\)/g, '')
    .replace(/\x1b]0;.*?\x07/g, '');
}

module.exports = { stripAnsi };
