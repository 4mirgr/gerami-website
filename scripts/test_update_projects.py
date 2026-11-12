import unittest
from update_projects import candidates


class UpdateProjectsTest(unittest.TestCase):
    def test_only_commit_changes_and_input_is_unchanged(self):
        old={'intmed':{'repository':'https://github.com/4mirgr/intMed-study-plan.git','commit':'a'*40,'mount':'intmed','public_directory':'docs'}}
        new=candidates(old,lambda repo, previous:'b'*40)
        self.assertEqual(old['intmed']['commit'],'a'*40)
        self.assertEqual(new['intmed'],{**old['intmed'],'commit':'b'*40})

    def test_invalid_remote_head_is_rejected(self):
        with self.assertRaises(ValueError):
            candidates({'aus':{'repository':'trusted','commit':'a'*40}},lambda repo, previous:'main; command')


if __name__ == '__main__':
    unittest.main()
