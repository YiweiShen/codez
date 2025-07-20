/**
 * Type declarations for importing text-based template files.
 */

declare module '*.mustache' {

  /** The content of the template file as a string. */

  const content: string;
  export default content;
}
