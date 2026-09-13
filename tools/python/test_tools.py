import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent


class ToolTests(unittest.TestCase):
    def run_tool(self, script, *args):
        return subprocess.run([sys.executable, str(ROOT / script), *map(str, args)], capture_output=True, text=True)

    def test_reproducible_unique_fictional_batteries(self):
        first = self.run_tool("generate_demo_data.py", "--count", 20, "--seed", 42)
        second = self.run_tool("generate_demo_data.py", "--count", 20, "--seed", 42)
        self.assertEqual(first.returncode, 0)
        self.assertEqual(first.stdout, second.stdout)
        data = json.loads(first.stdout)
        self.assertTrue(data["fictional"])
        self.assertEqual(len({b["battery_id"] for b in data["batteries"]}), 20)
        self.assertTrue(all("state" not in b for b in data["batteries"]))

    def test_invalid_count(self):
        self.assertEqual(self.run_tool("generate_demo_data.py", "--count", 0).returncode, 2)

    def test_write_and_verify_exact_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "demo.json"
            self.assertEqual(self.run_tool("generate_demo_data.py", "--output", file).returncode, 0)
            expected = hashlib.sha256(file.read_bytes()).hexdigest()
            result = self.run_tool("verify_payload_hash.py", file, "--expected", expected)
            self.assertEqual(result.returncode, 0)
            self.assertIn("MATCH", result.stdout)

    def test_mismatch_and_invalid_input(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "test.bin"
            file.write_bytes(b"abc")
            self.assertEqual(self.run_tool("verify_payload_hash.py", file, "--expected", "0" * 64).returncode, 1)
            self.assertEqual(self.run_tool("verify_payload_hash.py", file, "--expected", "bad").returncode, 2)
            self.assertEqual(self.run_tool("verify_payload_hash.py", file.with_name("missing")).returncode, 2)


if __name__ == "__main__":
    unittest.main()
