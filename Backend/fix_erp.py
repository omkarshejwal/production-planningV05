import re

file_path = "D:\\New folder\\Vitrum_Production_Planning\\src\\context\\ERPContext.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("const extendJob = (jobId: string, numberOfDays: number): boolean => {", "const extendJob = async (jobId: string, numberOfDays: number): Promise<boolean> => {")
content = content.replace("const created = planningRepository.createProductionJobsBatch(continuationRows);", "const created = await planningRepository.createProductionJobsBatch(continuationRows);")

content = content.replace("const finishJob = (jobId: string): boolean => {", "const finishJob = async (jobId: string): Promise<boolean> => {")
content = content.replace(
    "const updated = planningRepository.updateProductionJob(",
    "const updated = await planningRepository.updateProductionJob("
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("ERPContext patched")
