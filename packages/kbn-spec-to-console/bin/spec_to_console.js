/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */


const fs = require('fs');
const path = require('path');
const program = require('commander');
const glob = require('glob');

const packageJSON = require('../package.json');
const convert = require('../lib/convert');

program
  .version(packageJSON.version)
  .option('-g --glob []', 'Files to convert')
  .option('-d --directory []', 'Output directory')
  .parse(process.argv);

if (!program.glob) {
  console.error('Expected input');
  process.exit(1);
}

const files = glob.sync(program.glob);
console.log(files.length, files);
files.forEach(file => {
  const spec = JSON.parse(fs.readFileSync(file));
  const output = JSON.stringify(convert(spec), null, 2);
  if (program.directory) {
    const outputName = path.basename(file);
    const outputPath = path.resolve(program.directory, outputName);
    try {
      fs.mkdirSync(program.directory, { recursive: true });
      fs.writeFileSync(outputPath, output + '\n');
    } catch(e) {
      console.log('Cannot write file ', e);
    }
  } else {
    console.log(output);
  }
});
