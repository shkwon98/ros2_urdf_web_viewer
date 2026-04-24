from pathlib import Path
import unittest


def load_tests(loader, tests, pattern):
    return loader.discover(str(Path(__file__).parent), pattern or "test*.py")
