/**
 * Original C# Author: William (TinkerWorX)
 * Converting to Typescript: Henning Berge (Promises)
 */

import fs, {WriteStream} from 'fs';

export class TypeDefinition {
    public Name: string;
    public Parent: string;

    constructor(Name: string, Parent: string) {
        this.Name = Name;
        this.Parent = Parent;
    }

}

export class ArgumentDefinition {
    public Type: string;
    public Name: string;

    constructor(Type: string, Name: string) {
        this.Type = Type;
        this.Name = Name;
    }
}

export class NativeDefinition {
    public Name: string;
    public Arguments: ArgumentDefinition[];
    public ReturnType: string;

    constructor(Name: string, Arguments: ArgumentDefinition[], ReturnType: string) {
        this.Name = Name;
        this.Arguments = Arguments;
        this.ReturnType = ReturnType;
    }
}

export class GlobalDefinition {
    public IsConstant: boolean;
    public Type: string;
    public IsArray: boolean;
    public Name: string;
    public Value: string;

    constructor(IsConstant: boolean, Type: string, IsArray: boolean, Name: string, Value: string) {
        this.IsConstant = IsConstant;
        this.Type = Type;
        this.IsArray = IsArray;
        this.Name = Name;
        this.Value = Value;
    }
}

export class FunctionDefinition {
    public Name: string;
    public Arguments: ArgumentDefinition[];
    public ReturnType: string;

    constructor(Name: string, Arguments: ArgumentDefinition[], ReturnType: string) {
        this.Name = Name;
        this.Arguments = Arguments;
        this.ReturnType = ReturnType;
    }
}

export class LibraryDefinition {
    public Types: TypeDefinition[] = [];
    public Natives: NativeDefinition[] = [];
    public Globals: GlobalDefinition[] = [];
    public Functions: FunctionDefinition[] = [];

}


export class JassParser {
    private TYPE_DEFINITION: RegExp = new RegExp("type\\s+(?<name>\\w+)\\s+extends\\s+(?<parent>\\w+)");
    private NATIVE_DEFINITION: RegExp = new RegExp("native\\s+(?<name>\\w+)\\s+takes\\s+(?<prototype>.+)");
    public GLOBAL_DEFINITION: RegExp = new RegExp("(?<constant>constant)?\\s*(?<type>\\w+)(\\s+(?<array>array))?\\s+(?<name>\\w+)(\\s+=\\s(?<value>.+))?");
    private FUNCTION_DEFINITION: RegExp = new RegExp("function\\s+(?<name>\\w+)\\s+takes\\s+(?<prototype>.+)");


    private isNullOrWhitespace(input: string): boolean {

        if (typeof input === 'undefined' || input == null) return true;

        return input.replace(/\s/g, '').length < 1;
    }

    private clean(input: string): string {
        input = input.trim();
        while (input.indexOf("  ") >= 0) {
            input = input.replace("  ", " ");
        }
        while (input.indexOf("\\r") >= 0) {
            input = input.replace("\\r", "");
        }
        if (input.indexOf("//") >= 0)
            input = input.substr(0, input.indexOf("//"));
        while (input.indexOf("  ") >= 0) {
            input = input.replace("  ", " ");
        }
        return input;
    }

    private parseLines(lines: string[], library: LibraryDefinition) {
        let inGlobals: boolean = false;

        for (let rawLine of lines) {
            let line: string = this.clean(rawLine);
            if (line.startsWith('//')) {
                continue;
            }

            if (inGlobals) {

                inGlobals = !line.includes('endglobals');
                if (!inGlobals) {
                    continue;
                }
                let globalDefinition = line.match(this.GLOBAL_DEFINITION);
                if (globalDefinition != null) {
                    if (globalDefinition.groups) {
                        let type = globalDefinition.groups['type'];
                        let value = globalDefinition.groups["value"];
                        library.Globals.push(new GlobalDefinition(
                            !this.isNullOrWhitespace(globalDefinition.groups["constant"]),
                            type,
                            !this.isNullOrWhitespace(globalDefinition.groups["array"]),
                            globalDefinition.groups["name"],
                            value
                        ))
                    }
                }
            } else {
                inGlobals = line.includes('globals');
                if (inGlobals)
                    continue;


                let typeDefinition = line.match(this.TYPE_DEFINITION);
                if (typeDefinition != null) {
                    if (typeDefinition.groups) {
                        library.Types.push(new TypeDefinition(
                            typeDefinition.groups["name"],
                            typeDefinition.groups["parent"]
                        ))
                    }
                    continue;
                }


                let nativeDefinition = line.match(this.NATIVE_DEFINITION);
                if (nativeDefinition != null) {
                    if (nativeDefinition.groups) {

                        let name = nativeDefinition.groups["name"];
                        let prototype = nativeDefinition.groups["prototype"];
                        let takes = this.clean(prototype.split("returns")[0]);
                        let returns = this.clean(prototype.split("returns")[1]);
                        library.Natives.push(new NativeDefinition(
                            name,
                            takes == "nothing" ? [] : takes.split(',').map(s => s.trim()).map(s => new ArgumentDefinition(
                                s.split(' ')[0],
                                s.split(' ')[1],
                            )),
                            returns
                        ));
                        continue;
                    }
                }

                let functionDefinition = line.match(this.FUNCTION_DEFINITION);
                if (functionDefinition != null) {
                    if (functionDefinition.groups) {
                        let name = functionDefinition.groups["name"];
                        let prototype = functionDefinition.groups["prototype"];
                        let takes = this.clean(prototype.split("returns")[0]);
                        let returns = this.clean(prototype.split("returns")[1]);
                        library.Functions.push(new FunctionDefinition(
                            name,
                            takes == "nothing" ? [] : takes.split(',').map(s => s.trim()).map(s => new ArgumentDefinition(
                                s.split(' ')[0],
                                s.split(' ')[1],
                            )),
                            returns
                        ));
                        continue;
                    }
                }
            }
        }
    }

    private parseFile(path: string, library: LibraryDefinition) {
        this.parseLines(fs.readFileSync(path, 'utf8').split('\n'), library);
    }

    private writeLine(writer: WriteStream, line: string) {
        writer.write(line + "\n");
    }

    private blankLine(writer: WriteStream) {
        this.writeLine(writer, "");
    }

    private Magic(native: NativeDefinition) {
        switch (native.Name) {
            case "Condition":
            case "Filter":
                native.Arguments[0].Type = "() => boolean";
                break;
        }
    }

    private FixType(type: string): string {
        switch (type) {
            case "real":
            case "integer":
                type = "number";
                break;
            case "nothing":
                type = "void";
                break;
            case "code":
                type = "() => void";
                break;
            //case "boolexpr":
            //case "conditionfunc":
            //case "filterfunc":
            //type = "() => boolean";
            //break;
        }
        return type;
    }

    public main(args: string[]) {
        if (args.length < 4) {
            console.log("Usage: node index.js input1.j [input2.j...] output.d.ts");
            return 1;
        }
        args = args.slice(2, args.length);
        var inputFiles = args.slice(0, args.length - 1);
        var outputFile = args[args.length - 1];

        var library = new LibraryDefinition();

        for (let inputFile of inputFiles) {
            console.log(`Parsing: ${inputFile}`);
            this.parseFile(inputFile, library);
        }

        console.log((`Writing: ${outputFile}`));
        var writer = fs.createWriteStream(outputFile, {
            flags: 'w'
        });
        this.writeLine(writer, "/** @noSelfInFile **/");
        this.blankLine(writer);

        for (let type of library.Types) {
            this.writeLine(writer, `declare abstract class ${type.Name} extends ${type.Parent} { __${type.Name}: never; }`);
        }
        this.blankLine(writer);
        for (let native of library.Natives) {
            this.Magic(native);
            writer.write(`declare function ${native.Name}(`);
            if (native.Arguments.length != 0) {
                writer.write(`${native.Arguments.map(arg => `${arg.Name}: ${this.FixType(arg.Type)}`).reduce((a, b) => a + ", " + b)}`);

            }
            this.writeLine(writer, `): ${this.FixType(native.ReturnType)}`);
        }

        this.blankLine(writer);

        for (let global of library.Globals) {
            writer.write('declare');
            if (global.IsConstant)
                writer.write(" const");
            else
                writer.write(" var");
            writer.write(` ${global.Name}`);
            this.writeLine(writer,`: ${this.FixType(global.Type)}`);
        }
        this.blankLine(writer);

        for (let funct of library.Functions) {
            writer.write(`declare function ${funct.Name}(`);
            if (funct.Arguments.length != 0) {
                writer.write(`${funct.Arguments.map(arg => `${arg.Name}: ${this.FixType(arg.Type)}`).reduce((a, b) => a + ", " + b)}`);

            }
            this.writeLine(writer, `): ${this.FixType(funct.ReturnType)}`);
        }

        return 0;
    }
}
