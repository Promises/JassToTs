/**
 * Original C# Author: William (TinkerWorX)
 * Converting to Typescript: Henning Berge (Promises)
 */

import * as fs from 'fs';

export interface TypeDefinition {
    Name: string;
    Parent: string;

}

export class ArgumentDefinition {
    Type: string;
    Name: string;

    constructor(Type: string, Name: string) {
        this.Type = Type;
        this.Name = Name;
    }
}

export interface NativeDefinition {
    Name: string;
    Arguments: ArgumentDefinition[];
    ReturnType: string;

}

export interface GlobalDefinition {
    IsConstant: boolean;
    Type: string;
    IsArray: boolean;
    Name: string;
    Value: string;

}

export interface FunctionDefinition {
    Name: string;
    Arguments: ArgumentDefinition[];
    ReturnType: string;

}

export interface LibraryDefinition {
    Types: TypeDefinition[];
    Natives: NativeDefinition[];
    Globals: GlobalDefinition[];
    Functions: FunctionDefinition[];

}

export class JassParser {
    private TYPE_DEFINITION: RegExp = new RegExp('type\\s+(?<name>\\w+)\\s+extends\\s+(?<parent>\\w+)');
    private NATIVE_DEFINITION: RegExp = new RegExp('native\\s+(?<name>\\w+)\\s+takes\\s+(?<prototype>.+)');
    public GLOBAL_DEFINITION: RegExp = new RegExp(
        '(?<constant>constant)?\\s*(?<type>\\w+)(\\s+(?<array>array))?\\s+(?<name>\\w+)(\\s+=\\s(?<value>.+))?',
    );
    private FUNCTION_DEFINITION: RegExp = new RegExp('function\\s+(?<name>\\w+)\\s+takes\\s+(?<prototype>.+)');

    private static isNullOrWhitespace(input: string): boolean {

        if (typeof input === 'undefined' || input == null) {
            return true;
        }

        return input.replace(/\s/g, '').length < 1;
    }

    private static clean(input: string): string {
        input = input.trim();
        while (input.indexOf('  ') >= 0) {
            input = input.replace('  ', ' ');
        }
        while (input.indexOf('\\r') >= 0) {
            input = input.replace('\\r', '');
        }
        if (input.indexOf('//') >= 0) {
            input = input.substr(0, input.indexOf('//'));
        }
        while (input.indexOf('  ') >= 0) {
            input = input.replace('  ', ' ');
        }
        return input;
    }

    private static writeLine(writer: string[], line: string) {
        writer.push(line);
    }

    private static blankLine(writer: string[]) {
        JassParser.writeLine(writer, '');
    }

    private static Magic(native: NativeDefinition) {
        switch (native.Name) {
            case 'Condition':
            case 'Filter':
                native.Arguments[0].Type = '() => boolean';
                break;
        }
    }

    private static FixType(type: string, isReturn = false): string {
        switch (type) {
            case 'real':
            case 'integer':
                type = 'number';
                break;
            case 'nothing':
                type = 'void';
                break;
            case 'code':
                type = '() => void';
                break;
            case "boolexpr":
                if (!isReturn){
                    type = 'boolexpr | null';
                }
                break;
            // case "conditionfunc":
            // case "filterfunc":
            // type = "() => boolean";
            // break;
        }
        return type;
    }

    private parseLines(lines: string[], library: LibraryDefinition) {
        let inGlobals = false;

        for (const rawLine of lines) {
            const line: string = JassParser.clean(rawLine);
            if (line.startsWith('//')) {
                continue;
            }

            if (inGlobals) {

                inGlobals = !line.includes('endglobals');
                if (!inGlobals) {
                    continue;
                }
                const globalDefinition = line.match(this.GLOBAL_DEFINITION);
                if (globalDefinition != null) {
                    if (globalDefinition.groups) {
                        const type = globalDefinition.groups['type'];
                        const value = globalDefinition.groups['value'];

                        library.Globals.push({
                            IsConstant: !JassParser.isNullOrWhitespace(globalDefinition.groups['constant']),
                            Type: type,
                            IsArray: !JassParser.isNullOrWhitespace(globalDefinition.groups['array']),
                            Name: globalDefinition.groups['name'],
                            Value: value,
                        });
                    }
                }
            } else {
                inGlobals = line.includes('globals');
                if (inGlobals) {
                    continue;
                }

                const typeDefinition = line.match(this.TYPE_DEFINITION);
                if (typeDefinition != null) {
                    if (typeDefinition.groups) {
                        library.Types.push({
                            Name: typeDefinition.groups['name'],
                            Parent: typeDefinition.groups['parent'],
                        });
                    }
                    continue;
                }

                const nativeDefinition = line.match(this.NATIVE_DEFINITION);
                if (nativeDefinition != null) {
                    if (nativeDefinition.groups) {

                        const name = nativeDefinition.groups['name'];
                        const prototype = nativeDefinition.groups['prototype'];
                        const takes = JassParser.clean(prototype.split('returns')[0]);
                        const returns = JassParser.clean(prototype.split('returns')[1]);
                        library.Natives.push({
                            Name: name,
                            Arguments: takes === 'nothing' ? [] : takes.split(',').map(s => s.trim()).map(s => new ArgumentDefinition(
                                s.split(' ')[0],
                                s.split(' ')[1],
                            )),
                            ReturnType: returns,
                        });
                        continue;
                    }
                }

                const functionDefinition = line.match(this.FUNCTION_DEFINITION);
                if (functionDefinition != null) {
                    if (functionDefinition.groups) {
                        const name = functionDefinition.groups['name'];
                        const prototype = functionDefinition.groups['prototype'];
                        const takes = JassParser.clean(prototype.split('returns')[0]);
                        const returns = JassParser.clean(prototype.split('returns')[1]);
                        library.Functions.push({
                            Name: name,
                            Arguments: takes === 'nothing' ? [] : takes.split(',').map(s => s.trim()).map(s => new ArgumentDefinition(
                                s.split(' ')[0],
                                s.split(' ')[1],
                            )),
                            ReturnType: returns,
                        });

                    }
                }
            }
        }
    }

    private parseFile(path: string, library: LibraryDefinition) {
        this.parseLines(fs.readFileSync(path, 'utf8').split('\n'), library);
    }

    public main(args: string[]) {
        if (args.length < 4) {
            console.log('Usage: node index.js input1.j [input2.j...] output.d.ts');
            return 1;
        }
        args = args.slice(2, args.length);
        const inputFiles = args.slice(0, args.length - 1);
        const outputFile = args[args.length - 1];

        const library: LibraryDefinition = {
            Types: [],
            Natives: [],
            Globals: [],
            Functions: [],
        };

        for (const inputFile of inputFiles) {
            console.log(`Parsing: ${inputFile}`);
            this.parseFile(inputFile, library);
        }
        console.log((`Writing: ${outputFile}`));
        // const writer = fs.createWriteStream(outputFile, {
        //     flags: 'w',
        // });
        const writer: string[] = [];
        JassParser.writeLine(writer, '/** @noSelfInFile **/');
        JassParser.blankLine(writer);

        for (const type of library.Types) {
            JassParser.writeLine(writer, `declare interface ${type.Name} extends ${type.Parent} { __${type.Name}: never; }`);
        }
        JassParser.blankLine(writer);
        for (const native of library.Natives) {
            JassParser.Magic(native);
            let line = '';
            line += `declare function ${native.Name}(`;
            if (native.Arguments.length !== 0) {
                line += `${native.Arguments.map(
                        arg => `${arg.Name}: ${JassParser.FixType(arg.Type)}`,
                    ).reduce(
                        (a, b) => a + ', ' + b
                    )}`;

            }
            JassParser.writeLine(writer, line + `): ${JassParser.FixType(native.ReturnType, true)};`);
        }

        JassParser.blankLine(writer);

        for (const global of library.Globals) {
            let line = '';

            line += 'declare';
            if (global.IsConstant) {
                line += ' const';
            } else {
                line += ' var';
            }
            line += ` ${global.Name}`;
            const arrayText = (global.IsArray ? "[]" : "");
            JassParser.writeLine(writer, line + `: ${JassParser.FixType(global.Type)}${arrayText};`);
        }
        JassParser.blankLine(writer);

        for (const funct of library.Functions) {
            let line = '';

            line += `declare function ${funct.Name}(`;
            if (funct.Arguments.length !== 0) {
                line += `${funct.Arguments.map(
                        arg => `${arg.Name}: ${JassParser.FixType(arg.Type)}`
                    ).reduce((a, b) => a + ', ' + b)}`;

            }
            JassParser.writeLine(writer, line + `): ${JassParser.FixType(funct.ReturnType, true)};`);
        }

        fs.writeFileSync(outputFile, writer.join('\n'));

        return 0;

    }
}