# Changelog

All notable changes to the "squash-push" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2023-06-15

### Added
- Initial release of the Squash-Push extension
- Command to identify current Git branch
- Command to determine upstream branch
- Command to list local commits that haven't been pushed
- Interactive UI to select base commit for squashing
- Squash operation functionality
- Error handling for common Git scenarios

### Fixed
- N/A (Initial release)

## [Unreleased]

### Added
- Comprehensive JSDoc documentation for all functions
- Improved error handling for root commits
- Better user feedback during squash operations

### Changed
- Renamed command from "squash-push.helloWorld" to "squash-push.squashCommits"
- Refactored Git commands into a constants object
- Improved code organization and readability

### Fixed
- Fixed issue with commit selection validation
- Added check to prevent squashing onto root commits

### Security
- N/A

## Planned for Future Releases
- Support for multiple workspace folders
- Interactive rebase option
- Custom commit message templates
- Branch protection rules
- Undo squash operation