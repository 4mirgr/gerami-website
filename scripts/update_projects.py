"""Advance only the existing IntMed/AUS immutable pins; validation runs separately."""
import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path
from validate_content import ROOT, validate


def candidates(pins, resolve):
    result = json.loads(json.dumps(pins))
    for name, spec in result.items():
        head = resolve(spec['repository'], spec['commit'])
        if not re.fullmatch(r'[0-9a-f]{40}', head):
            raise ValueError(f'{name}: invalid upstream commit SHA')
        spec['commit'] = head
    return result


UPSTREAM_BRANCHES = {
    'https://github.com/4mirgr/intMed-study-plan.git': 'refs/heads/claude/quirky-ride-mavb6b',
    'https://github.com/4mirgr/immi-arash-amir.git': 'refs/heads/main',
}


def resolve(repository, previous):
    branch = UPSTREAM_BRANCHES[repository]
    result = subprocess.check_output(['git', 'ls-remote', '--exit-code', repository, branch], text=True, timeout=60)
    head = result.split()[0]
    if not re.fullmatch(r'[0-9a-f]{40}', head):
        raise ValueError('Invalid upstream SHA')
    if head != previous:
        with tempfile.TemporaryDirectory(prefix='gerami-ancestry-') as temp:
            work = Path(temp)
            subprocess.run(['git', 'init', '-q', str(work)], check=True, timeout=30)
            subprocess.run(['git', '-C', str(work), 'fetch', '--quiet', '--filter=blob:none', repository, previous, head], check=True, timeout=180)
            subprocess.run(['git', '-C', str(work), 'merge-base', '--is-ancestor', previous, head], check=True, timeout=30)
    return head


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    validate()
    path = ROOT / 'deploy/projects.json'
    original = json.loads(path.read_text())
    updated = candidates(original, resolve)
    for name in original:
        print(f"{name}: {original[name]['commit']} -> {updated[name]['commit']}")
    if args.write:
        path.write_text(json.dumps(updated, indent=2) + '\n')
        validate()
    else:
        print('Read-only; pass --write to prepare candidates. No commit or deployment performed.')


if __name__ == '__main__':
    main()
