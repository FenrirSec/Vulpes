# VulPKG - Vulpes Package Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)

**VulPKG** is the official package manager for [Vulpes OS](https://github.com/FenrirSec/vulpes), Fenrir.pro's offensive security operating system. It provides a simple, standardized way to install and manage custom security tools and applications on Alpine Linux-based systems.

## Features

- 🔧 **Standardized Package Format**: JSON-based `.vulpkg` files for easy package creation
- 📦 **Alpine Integration**: Automatic installation of Alpine packages (including edge repositories)
- 🗂️ **Repository System**: Central package repository for easy installation by name
- 🎯 **Simple CLI**: Intuitive command-line interface for all operations

## Installation

### From GitHub (Recommended)

```bash
pip install git+https://github.com/FenrirSec/vulpkg.git
```

### Manual Installation

```bash
git clone https://github.com/FenrirSec/vulpkg.git
cd vulpkg
pip install .
```

### Development Installation

```bash
git clone https://github.com/FenrirSec/vulpkg.git
cd vulpkg
pip install -e .
```

## Quick Start

### Installing a Package

```bash
# Install from repository by name
sudo vulpkg install burpsuite

# Install from a specific .vulpkg file
sudo vulpkg install /path/to/package.vulpkg
```

### Listing Packages

```bash
# List installed packages
vulpkg list

# List available packages in repository
vulpkg available
```

### Managing Packages

```bash
# Show package information
vulpkg info burpsuite

# Remove a package
sudo vulpkg remove burpsuite
```

## Package Format

VulPKG uses JSON-based `.vulpkg` files with the following structure:

```json
{
  "name": "package-name",
  "version": "1.0.0",
  "description": "Package description",
  "author": "Author Name",
  "requires_sudo": true,
  "alpine_packages": [
    "openjdk21-jre",
    "wget",
    "edge:some-edge-package"
  ],
  "install_script": "wget https://example.com/file.jar -O app.jar",
  "files": {
    "app.sh": "#!/bin/bash\njava -jar $PWD/app.jar \"$@\""
  }
}
```

### Package Specification

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Package identifier (used for installation/removal) |
| `version` | string | Yes | Package version (semantic versioning recommended) |
| `description` | string | No | Human-readable package description |
| `author` | string | No | Package author/maintainer |
| `requires_sudo` | boolean | No | Whether the installation requires root privileges |
| `alpine_packages` | array | No | Alpine packages to install (prefix with `edge:` for edge repo) |
| `install_script` | string | No | Bash script to execute during installation |
| `files` | object | No | Files to create (path: content mapping) |

## Example: BurpSuite Package

Here's a complete example for installing BurpSuite Community Edition:

**burpsuite.vulpkg:**
```json
{
  "name": "burpsuite",
  "version": "2024.10.3",
  "description": "Burp Suite Community Edition - Web security testing toolkit",
  "author": "PortSwigger",
  "requires_sudo": true,
  "alpine_packages": [
    "openjdk21-jre",
    "wget"
  ],
  "install_script": "wget 'https://portswigger-cdn.net/burp/releases/download?product=community&version=2024.10.3&type=Jar' -O burp.jar",
  "files": {
    "burp.sh": "#!/bin/bash\njava -jar $PWD/burp.jar \"$@\""
  }
}
```

**Installation:**
```bash
# Copy to repository
sudo cp burpsuite.vulpkg /var/lib/vulpkg/repo/

# Install by name
sudo vulpkg install burpsuite

# Run BurpSuite
/opt/vulpkg/burpsuite/burp.sh
```

## Directory Structure

VulPKG uses the following directories:

- `/var/lib/vulpkg/repo/` - Package repository (place `.vulpkg` files here)
- `/var/lib/vulpkg/installed.json` - Database of installed packages
- `/opt/vulpkg/<package>/` - Installation directory for each package

## Creating Packages

### Step 1: Create the Package Definition

Create a `.vulpkg` JSON file with your package specification.

### Step 2: Test Installation

```bash
sudo vulpkg install your-package.vulpkg
```

### Step 3: Add to Repository

```bash
sudo cp your-package.vulpkg /var/lib/vulpkg/repo/
```

### Best Practices

- Use semantic versioning (e.g., `1.0.0`, `2.1.3`)
- Keep installation scripts idempotent when possible
- Test packages on a clean Vulpes OS installation
- Document any manual post-installation steps in the description
- Use absolute paths in `files` for system-wide binaries

## Commands Reference

### `vulpkg install <package>`
Install a package by name (from repository) or path (`.vulpkg` file).

**Options:**
- Requires sudo if package specifies `requires_sudo: true`

**Example:**
```bash
sudo vulpkg install metasploit
sudo vulpkg install /tmp/custom-tool.vulpkg
```

### `vulpkg remove <package>`
Remove an installed package.

**Example:**
```bash
sudo vulpkg remove metasploit
```

### `vulpkg list`
List all installed packages with versions and descriptions.

### `vulpkg available`
List all packages available in the repository.

### `vulpkg info <package>`
Show detailed information about an installed package.

**Example:**
```bash
vulpkg info burpsuite
```

## Contributing

We welcome contributions! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Package Contributions

To contribute a package to the official Vulpes repository:

1. Create a `.vulpkg` file following the specification
2. Test thoroughly on Vulpes OS
3. Submit a PR with your package file and a brief description

## Troubleshooting

### Permission Denied

If you get permission errors:
```bash
# Ensure you're using sudo for packages that require it
sudo vulpkg install package-name

# Check directory permissions
sudo chmod -R 755 /var/lib/vulpkg
sudo chmod -R 755 /opt/vulpkg
```

### Package Not Found

If a package isn't found:
```bash
# Check what's available
vulpkg available

# Ensure the .vulpkg file is in the repository
ls -la /var/lib/vulpkg/repo/
```

### Alpine Package Installation Fails

If Alpine package installation fails:
```bash
# Update package index
sudo apk update

# Try installing the package manually to see the error
sudo apk add package-name
```

## Security Considerations

This project has not been heavily tested. We're using it internally and hope that it can also be useful to someone else, but in any way, DO NOT USE, IN ANY untrusted or unknown .vulpkg files!
Review the project's code and make sure it suits your security requirements.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## About FenrirSec

VulPKG is developed and maintained by [FenrirSec](https://github.com/FenrirSec), a security research organization focused on offensive security innovation and education.

### Related Projects

- [Vulpes OS](https://github.com/FenrirSec/vulpes) - Our offensive security operating system

## Support

- 📧 Issues: [GitHub Issues](https://github.com/FenrirSec/vulpkg/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/FenrirSec/vulpkg/discussions)
- 🌐 Website: [FenrirSec](https://fenrir.pro)

## Acknowledgments

Built with ❤️ for the offensive security community.

---

**Note**: VulPKG is designed specifically for Vulpes OS (Alpine Linux-based). While it works on other Alpine-based systems, support is only provided for Vulpes OS.