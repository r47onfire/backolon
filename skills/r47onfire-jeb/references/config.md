# Configuration

## JEBErrorOptions

Extra options accepted when constructing a JEBError.

### Properties

#### children

Sub-errors bundled into this error, e.g. several failures reported
together.

**Type:** `JEBError[]`

#### paramLocation

Location of the specific call argument this error blames (see
JEBError.paramLocation).

**Type:** `Location`

#### paramName

Name of the parameter this error blames, used to name the frame the VM
adds for it (see JEBError.paramName).

**Type:** `Identifier`