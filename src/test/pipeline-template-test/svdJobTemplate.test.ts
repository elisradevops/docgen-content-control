import fs from 'fs';
import path from 'path';

describe('SVD job template range delegation', () => {
  const template = fs.readFileSync(
    path.resolve(__dirname, '../../../../docs/pipeline-templates/svd/svd-job.yaml'),
    'utf8'
  );

  it('delegates pipeline previous-build discovery to the backend', () => {
    expect(template).not.toContain('_apis/build/builds?definitions=');
    expect(template).toContain("$runFrom = if ($paramFrom) { $paramFrom } else { '' }");
    expect(template).toContain("$runTo   = if ($paramTo) { $paramTo } else { $buildId }");
  });

  it('delegates release latest and previous discovery to the backend', () => {
    expect(template).not.toContain('_apis/release/releases?definitionId=');
    expect(template).toContain("$fromReleaseId = if ($paramFrom) { $paramFrom } else { '' }");
    expect(template).toContain("$toReleaseId   = if ($paramTo) { $paramTo } else { '' }");
    expect(template).toContain('repoId                        = $releaseDefId');
  });

  it('does not expose unused working directory parameter', () => {
    expect(template).not.toContain('name: workingDirectory');
  });

  it('uses JfrogBuildInfo parameter for generic upload build info collection', () => {
    expect(template).toContain('name: JfrogBuildInfo');
    expect(template).toContain("collectBuildInfo: '${{ parameters.JfrogBuildInfo }}'");
  });
});
