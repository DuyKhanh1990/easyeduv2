type FormulaNode =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "unary"; operator: "+" | "-"; operand: FormulaNode }
  | { type: "binary"; operator: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode }
  | { type: "percentage"; operand: FormulaNode };

type FormulaToken =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "leftParen" }
  | { type: "rightParen" }
  | { type: "percent" }
  | { type: "end" };

class FormulaSyntaxError extends Error {}

function tokenize(formula: string, sectionNames: string[]): FormulaToken[] {
  const normalizedNames = sectionNames.map((name) => name.trim().toLocaleLowerCase());
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new FormulaSyntaxError("Tên các phần thi phải khác nhau để dùng trong công thức.");
  }

  const allowedNames = new Set(sectionNames.map((name) => name.trim()));
  let source = formula.trim();
  if (source.startsWith("=")) source = source.slice(1).trim();
  if (!source) throw new FormulaSyntaxError("Nhập công thức điểm tổng.");

  const tokens: FormulaToken[] = [];
  let position = 0;

  while (position < source.length) {
    const character = source[position];
    if (/\s/.test(character)) {
      position += 1;
      continue;
    }

    if (character === "[") {
      const closingBracket = source.indexOf("]", position + 1);
      if (closingBracket < 0) {
        throw new FormulaSyntaxError("Biến kỹ năng chưa có dấu đóng ].");
      }
      const name = source.slice(position + 1, closingBracket).trim();
      if (!name) throw new FormulaSyntaxError("Tên biến kỹ năng không được để trống.");
      if (!allowedNames.has(name)) {
        throw new FormulaSyntaxError(`Không tìm thấy kỹ năng “${name}”. Hãy chèn biến từ danh sách kỹ năng.`);
      }
      tokens.push({ type: "variable", name });
      position = closingBracket + 1;
      continue;
    }

    const numberMatch = source.slice(position).match(/^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      const value = Number(numberMatch[0]);
      if (!Number.isFinite(value)) throw new FormulaSyntaxError("Số trong công thức không hợp lệ.");
      tokens.push({ type: "number", value });
      position += numberMatch[0].length;
      continue;
    }

    if (character === "+" || character === "-" || character === "*" || character === "/") {
      tokens.push({ type: "operator", value: character });
    } else if (character === "(") {
      tokens.push({ type: "leftParen" });
    } else if (character === ")") {
      tokens.push({ type: "rightParen" });
    } else if (character === "%") {
      tokens.push({ type: "percent" });
    } else {
      throw new FormulaSyntaxError(`Ký tự “${character}” không được hỗ trợ trong công thức.`);
    }
    position += 1;
  }

  tokens.push({ type: "end" });
  return tokens;
}

class FormulaParser {
  private position = 0;
  private readonly usedVariables = new Set<string>();

  constructor(private readonly tokens: FormulaToken[]) {}

  parse(): { expression: FormulaNode; usedVariables: Set<string> } {
    const expression = this.parseAdditive();
    if (this.current().type !== "end") {
      throw new FormulaSyntaxError("Kiểm tra lại thứ tự phép tính và dấu ngoặc.");
    }
    if (!this.usedVariables.size) {
      throw new FormulaSyntaxError("Công thức cần sử dụng ít nhất một kỹ năng.");
    }
    return { expression, usedVariables: this.usedVariables };
  }

  private current(): FormulaToken {
    return this.tokens[this.position];
  }

  private parseAdditive(): FormulaNode {
    let expression = this.parseMultiplicative();
    while (
      this.current().type === "operator" &&
      (this.current().value === "+" || this.current().value === "-")
    ) {
      const operator = this.current().value;
      this.position += 1;
      expression = {
        type: "binary",
        operator,
        left: expression,
        right: this.parseMultiplicative(),
      };
    }
    return expression;
  }

  private parseMultiplicative(): FormulaNode {
    let expression = this.parseUnary();
    while (
      this.current().type === "operator" &&
      (this.current().value === "*" || this.current().value === "/")
    ) {
      const operator = this.current().value;
      this.position += 1;
      expression = {
        type: "binary",
        operator,
        left: expression,
        right: this.parseUnary(),
      };
    }
    return expression;
  }

  private parseUnary(): FormulaNode {
    if (this.current().type === "operator" && (this.current().value === "+" || this.current().value === "-")) {
      const operator = this.current().value;
      this.position += 1;
      return { type: "unary", operator, operand: this.parseUnary() };
    }
    return this.parsePercent();
  }

  private parsePercent(): FormulaNode {
    let expression = this.parsePrimary();
    while (this.current().type === "percent") {
      this.position += 1;
      expression = { type: "percentage", operand: expression };
    }
    return expression;
  }

  private parsePrimary(): FormulaNode {
    const token = this.current();
    if (token.type === "number") {
      this.position += 1;
      return { type: "number", value: token.value };
    }
    if (token.type === "variable") {
      this.position += 1;
      this.usedVariables.add(token.name);
      return { type: "variable", name: token.name };
    }
    if (token.type === "leftParen") {
      this.position += 1;
      const expression = this.parseAdditive();
      if (this.current().type !== "rightParen") {
        throw new FormulaSyntaxError("Thiếu dấu đóng ngoặc ).");
      }
      this.position += 1;
      return expression;
    }
    throw new FormulaSyntaxError("Thiếu số, biến kỹ năng hoặc dấu ngoặc hợp lệ trong công thức.");
  }
}

function parseFormula(formula: string, sectionNames: string[]) {
  const tokens = tokenize(formula, sectionNames);
  return new FormulaParser(tokens).parse();
}

export function validateScoreConversionFormula(formula: string, sectionNames: string[]): string | null {
  try {
    parseFormula(formula, sectionNames);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Công thức không hợp lệ.";
  }
}

export function evaluateScoreConversionFormula(
  formula: string,
  scoreBySectionName: ReadonlyMap<string, number>,
): number {
  const { expression } = parseFormula(formula, [...scoreBySectionName.keys()]);

  const evaluate = (node: FormulaNode): number => {
    if (node.type === "number") return node.value;
    if (node.type === "variable") {
      const score = scoreBySectionName.get(node.name);
      if (score === undefined || !Number.isFinite(score)) {
        throw new FormulaSyntaxError(`Chưa có điểm quy đổi hợp lệ cho kỹ năng “${node.name}”.`);
      }
      return score;
    }
    if (node.type === "unary") {
      const operand = evaluate(node.operand);
      return node.operator === "-" ? -operand : operand;
    }
    if (node.type === "percentage") return evaluate(node.operand) / 100;

    const left = evaluate(node.left);
    const right = evaluate(node.right);
    if (node.operator === "+") return left + right;
    if (node.operator === "-") return left - right;
    if (node.operator === "*") return left * right;
    if (right === 0) throw new FormulaSyntaxError("Không thể chia cho 0 trong công thức.");
    return left / right;
  };

  const result = evaluate(expression);
  if (!Number.isFinite(result)) throw new FormulaSyntaxError("Công thức tạo ra kết quả không hợp lệ.");
  return result;
}