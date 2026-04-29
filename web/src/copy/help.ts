// Re-export of shared/copy/help.json for web consumers.
import help from '../../../shared/copy/help.json'

export default help

export const expectations = (help as { expectations: { promise: string; title: string } }).expectations
