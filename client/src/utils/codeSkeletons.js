export const CODE_SKELETONS = {
  javascript: `// JavaScript Example
console.log("Hello, World!");

// Your code here
function myFunction() {
  return "Hello";
}

console.log(myFunction());
`,

  typescript: `// TypeScript Example
const greeting: string = "Hello, World!";
console.log(greeting);

// Your code here
function add(a: number, b: number): number {
  return a + b;
}

console.log(add(5, 3));
`,

  python: `# Python Example
print("Hello, World!")

# Your code here
def my_function():
    return "Hello"

print(my_function())
`,

  java: `// Java - Name this class "Main"
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        // Your code here
    }
}
`,

  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    
    // Your code here
    
    return 0;
}
`,

  c: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    
    // Your code here
    
    return 0;
}
`,

  go: `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
    
    // Your code here
}
`,

  rust: `fn main() {
    println!("Hello, World!");
    
    // Your code here
}
`,

  ruby: `# Ruby Example
puts "Hello, World!"

# Your code here
def my_function
  "Hello"
end

puts my_function()
`,

  php: `<?php
echo "Hello, World!" . PHP_EOL;

// Your code here
function myFunction() {
    return "Hello";
}

echo myFunction() . PHP_EOL;
?>
`,

  bash: `#!/bin/bash
echo "Hello, World!"

# Your code here
function myFunction() {
    echo "Hello"
}

myFunction()
`,
}
