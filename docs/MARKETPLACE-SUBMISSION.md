### Repository URL

https://github.com/Acero-AD/omarchy-writing-pet

### Category

Productivity

### Tags

bar, quickshell

### Suggest a missing tag

_No response_

### Maintainer notes

Writing Critter is one `bar-widget` plugin with a bundled Python engine. The
panel asks for explicit confirmation before setup copies the engine to
`~/.local/bin/writing-critter` and writes one systemd user unit at the invoking
user's XDG configuration path (normally
`~/.config/systemd/user/writing-critter.service`). It then enables and starts
that user service.

Setup does not use sudo, polkit, a package manager, or the network. The engine
uses only Python's standard library. Removing the engine stops and disables the
service and removes only those two installed files; settings, count, and
history remain. Omarchy has no plugin uninstall hook, so the documented removal
order removes the engine before the plugin.

The Marketplace Automated Security Baseline is expected to identify installer
and service-management capabilities. This is context for review, not a claim
about the scanner's result; please use the exact baseline report for the
submitted commit.

### Submission checklist

- [ ] The repository is public and contains installation and removal instructions.
- [ ] I have documented the plugin license and any external dependencies.
- [ ] I confirm that I own or have permission to submit this plugin and its preview assets.
- [ ] The plugin does not overwrite user configuration without explicit consent.
- [ ] I understand that approval is for listing and is not a security review.
