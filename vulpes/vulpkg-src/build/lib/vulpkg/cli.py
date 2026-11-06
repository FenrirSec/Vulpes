#!/usr/bin/env python3
"""
VulPKG CLI Entry Point
"""

import argparse
from pathlib import Path
from .manager import VulPKG


def main():
    parser = argparse.ArgumentParser(
        description='VulPKG - Vulpes Package Manager',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  vulpkg install burpsuite          Install package from repository
  vulpkg install package.vulpkg     Install from .vulpkg file
  vulpkg remove burpsuite           Remove installed package
  vulpkg list                       List installed packages
  vulpkg info burpsuite             Show package information

For more information: https://github.com/FenrirSec/vulpkg
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Install command
    install_parser = subparsers.add_parser('install', help='Install a package')
    install_parser.add_argument('package', help='Package name or path to .vulpkg file')
    
    # Remove command
    remove_parser = subparsers.add_parser('remove', help='Remove a package')
    remove_parser.add_argument('package', help='Package name to remove')
    
    # List command
    subparsers.add_parser('list', help='List installed packages')

    # Available command
    subparsers.add_parser('available', help='List available packages in repository')

    # Info command
    info_parser = subparsers.add_parser('info', help='Show package information')
    info_parser.add_argument('package', help='Package name')
    
    # Version command
    subparsers.add_parser('version', help='Show version information')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    if args.command == 'version':
        from . import __version__
        print(f"VulPKG v{__version__}")
        print("Package manager for Vulpes OS")
        print("https://github.com/FenrirSec/vulpkg")
        return
    
    manager = VulPKG()
    
    if args.command == 'install':
        # Try to resolve as path first, then as package name
        manager.install(args.package)
    elif args.command == 'remove':
        manager.remove(args.package)
    elif args.command == 'list':
        manager.list_installed()
    elif args.command == 'available':
        manager.available()
    elif args.command == 'info':
        manager.info(args.package)


if __name__ == '__main__':
    main()

