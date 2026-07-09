-- 版本迭代元数据：相对 base 版本的结构化改动（谁、何时、改了什么）
ALTER TABLE versions ADD COLUMN changes TEXT;
