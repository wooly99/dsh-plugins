/**
 * Host half of the rightbar-middle-close bundle.
 *
 * The gesture belongs to the browser: the Client module installs one capture
 * listener and collapses the right sidebar through `ctx.sidebarRight`. The Host
 * row exists so the profile carries the bundle and the Plugins pages can list
 * its title, description, and icon; it wires no Host service.
 */
export function apply() {}
