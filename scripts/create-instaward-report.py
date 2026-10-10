"""Create a local report draft from Git and numeric test summaries. Never calls Notion/product."""
import argparse
import datetime as dt
import re
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REPORTS=ROOT/'docs/instaward/reports'
REPO='https://github.com/chrlstl4n2307-ai/Byetery'
def git(*args):
    return subprocess.check_output(['git',*args],cwd=ROOT).decode('utf-8').strip()
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-date',required=True,type=dt.date.fromisoformat)
    parser.add_argument('--to-date',required=True,type=dt.date.fromisoformat)
    parser.add_argument('--week',required=True,type=int,choices=range(1,5))
    parser.add_argument('--classification',choices=['baseline','sprint'],default='baseline')
    parser.add_argument('--sprint-start',type=dt.date.fromisoformat)
    parser.add_argument('--test-log',action='append',default=[])
    args=parser.parse_args()
    if args.to_date<args.from_date:parser.error('End date precedes start date')
    if args.classification=='sprint' and (not args.sprint_start or args.from_date<args.sprint_start):
        parser.error('Sprint reports require an explicitly confirmed start and period after it')
    head=git('rev-parse','HEAD');branch=git('branch','--show-current')
    rows=git('log',f'--since={args.from_date}T00:00:00-03:00',f'--until={args.to_date}T23:59:59-03:00','--format=%H|%aI|%s').splitlines()
    summaries=[]
    for name in args.test_log:
        file=(ROOT/name).resolve()
        if not file.is_relative_to(ROOT) or not file.is_file() or file.stat().st_size>2_000_000:
            parser.error('Test log must be a bounded local repository file')
        for line in file.read_text(encoding='utf-8-sig',errors='replace').splitlines():
            if re.fullmatch(r'(?:[ℹ#]\s*)?(?:tests|pass|fail|cancelled|skipped|todo)\s+\d+',line.strip()):
                summaries.append(line.strip())
            elif re.fullmatch(r'test result: (?:ok|FAILED)\. \d+ passed; \d+ failed;.*',line.strip()):
                # Numeric values only; don't copy arbitrary diagnostics/source paths.
                match=re.search(r'(\d+) passed; (\d+) failed',line)
                summaries.append(f'Native summary: {match[1]} passed, {match[2]} failed')
    template=(ROOT/'docs/instaward/NOTION-PROGRESS-TEMPLATE.md').read_text(encoding='utf-8').split('<!-- BYETERY-INSTAWARD-DOCUMENTATION -->')[-1].lstrip()
    label='PRE-SPRINT BASELINE' if args.classification=='baseline' else 'INSTAWARD SPRINT'
    template=template.replace('Classification: INSTAWARD SPRINT (only after confirming official start)','Classification: '+label)
    template=template.replace('Week: [1–4]',f'Week: {args.week} (draft, not completion)')
    template=template.replace('Dates: [YYYY-MM-DD — YYYY-MM-DD; America/Santiago]',f'Dates: {args.from_date} — {args.to_date}; America/Santiago')
    template=template.replace('Branch: [branch]','Branch: '+branch).replace('Commit: [exact hash]',f'Commit: [{head}]({REPO}/commit/{head})')
    template+='\n## Source reconstruction appendix — draft only\n\nCommit timestamps show recorded changes, not hours worked. No test, transaction or criterion PASS is inferred automatically. Review all placeholders.\n\n'
    for row in rows:
        h,date,title=row.split('|',2)
        template+=f'- {date}: [{h}]({REPO}/commit/{h}) — {title}\n'
    if not rows:template+='No commits found in this branch for the period; uncommitted work may still exist.\n'
    template+='\n### Current diff statistics\n\n```text\n'+git('diff','--stat')+'\n```\n'
    template+='\n### Numeric summaries supplied by the reviewer\n\n'+('\n'.join('- '+s for s in summaries) if summaries else 'No numeric test log supplied.')+'\n\nExecution date and exact tested source must be filled from evidence; not inferred from file modification time.\n'
    REPORTS.mkdir(parents=True,exist_ok=True)
    out=REPORTS/f'{args.from_date}-week-{args.week}-{args.classification}-DRAFT.md'
    with out.open('x',encoding='utf-8') as f:f.write(template)
    print('Created local draft: '+out.relative_to(ROOT).as_posix())
if __name__=='__main__':main()
