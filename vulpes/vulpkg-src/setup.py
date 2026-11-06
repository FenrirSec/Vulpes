#!/usr/bin/env python3
"""
VulPKG Setup Script
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read the README file
this_directory = Path(__file__).parent
long_description = (this_directory / "README.md").read_text()

setup(
    name="vulpkg",
    version="1.0.0",
    author="Fenrir.pro",
    author_email="github@fenrir.pro",
    description="Package manager for Vulpes OS - offensive security operating system",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/FenrirSec/vulpkg",
    project_urls={
        "Bug Tracker": "https://github.com/FenrirSec/vulpkg/issues",
        "Documentation": "https://github.com/FenrirSec/vulpkg#readme",
        "Source Code": "https://github.com/FenrirSec/vulpkg",
        "Vulpes OS": "https://github.com/FenrirSec/vulpes",
    },
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: System Administrators",
        "Intended Audience :: Information Technology",
        "Topic :: System :: Software Distribution",
        "Topic :: Security",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Operating System :: POSIX :: Linux",
        "Environment :: Console",
    ],
    python_requires=">=3.8",
    install_requires=[
        # No external dependencies - uses only Python stdlib
    ],
    entry_points={
        "console_scripts": [
            "vulpkg=vulpkg.cli:main",
        ],
    },
    keywords=[
        "package-manager",
        "alpine",
        "vulpes",
        "security",
        "pentesting",
        "offensive-security",
        "fenrirsec",
    ],
    license="MIT",
    platforms=["Linux"],
)
